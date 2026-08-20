#include "junie.h"

#include <stdio.h>
#include <stdlib.h>
#include <stdarg.h>
#include <string.h>
#include <time.h>
#include <math.h>

#include "interop.h"
#include "rthreads/rthreads.h"

#define LOG(msg, ...) core_log_params(__FUNCTION__, msg, __VA_ARGS__)

typedef enum {
	JUN_PATH_GAME   = 0,
	JUN_PATH_STATE  = 1,
	JUN_PATH_SRAM   = 2,
	JUN_PATH_RTC    = 3,
	JUN_PATH_CHEATS = 4,
	JUN_PATH_SAVES  = 5,
	JUN_PATH_SYSTEM = 6,
	JUN_PATH_MAX    = 7,
} JuniePatchType;

static struct CTX {
	bool initialized;
	bool destroying;

	char *paths[JUN_PATH_MAX];
	char *game_name;
	char *game_extension;

	struct retro_game_info game;
	struct retro_game_info_ext game_ext;
	struct retro_system_info system;
	struct retro_system_av_info av;
	const struct retro_system_content_info_override *content_overrides;

	sthread_t *core_thread;
	sthread_t *memory_thread;
	scond_t *cond;
	slock_t *mutex;
	uint64_t queue_head;
	uint64_t queue_tail;
	uint64_t run_entered;
	uint64_t run_returned;

	void *memory;
	size_t memory_size;

	uint8_t speed;
	bool inputs[UINT8_MAX];
	bool variables_update;

	struct {
		bool pressed;
		int16_t x;
		int16_t y;
	} pointer;

	JunieSymbols sym;
	JunieVideo video;
	JunieAudio audio;
	JunieVariable variables[INT8_MAX];
	char *error;
} CTX;

static void core_log_params(const char *func, const char *fmt, ...)
{
#if defined(DEBUG)
	va_list args = {0};
	va_start(args, fmt);

	size_t func_len = strlen(func);
	size_t format_len = strlen(fmt);
	char *format = calloc(func_len + format_len + 4, 1);

	memcpy(format, func, func_len);
	memcpy(format + func_len, ": ", 2);
	memcpy(format + func_len + 2, fmt, format_len);

	size_t length = strlen(format);
	if (format[length - 1] != '\n')
		format[length] = '\n';

	vfprintf(stdout, format, args);
	fflush(stdout);

	free(format);
	va_end(args);
#endif
}

static uint64_t core_get_ticks()
{
	struct timespec now = {0};
	clock_gettime(CLOCK_REALTIME, &now);
	return now.tv_sec * 1000.0 + now.tv_nsec / 1000000.0;
}

static void core_sleep(uint32_t timeout)
{
	nanosleep(& (struct timespec) {
		.tv_sec = timeout / 1000,
		.tv_nsec = (timeout % 1000) * 1000 * 1000,
	}, NULL);
}

static char *core_strfmt(const char *fmt, ...)
{
	va_list args;
	va_list args_copy;

	va_start(args, fmt);
	va_copy(args_copy, args);

	size_t size = vsnprintf(NULL, 0, fmt, args_copy) + 1;

	char *str = calloc(size, 1);
	vsnprintf(str, size, fmt, args);

	va_end(args_copy);
	va_end(args);

	return str;
}

static void core_set_error(const char *fmt, ...)
{
	va_list args;
	va_list args_copy;

	va_start(args, fmt);
	va_copy(args_copy, args);

	size_t size = vsnprintf(NULL, 0, fmt, args_copy) + 1;

	free(CTX.error);
	CTX.error = calloc(size, 1);
	vsnprintf(CTX.error, size, fmt, args);

	va_end(args_copy);
	va_end(args);
}

static void core_log_cb(enum retro_log_level level, const char *fmt, ...)
{
	va_list args;
	va_start(args, fmt);

	char buffer[4096] = {0};
	vsnprintf(buffer, sizeof(buffer), fmt, args);
	LOG("%s", buffer);

	va_end(args);
}

static bool environment(unsigned cmd, void *data)
{
	unsigned command = cmd & ~RETRO_ENVIRONMENT_EXPERIMENTAL;
	switch (command) {
		case RETRO_ENVIRONMENT_SET_PIXEL_FORMAT: {
			enum retro_pixel_format *format = data;

			CTX.video.format = *format;

			return true;
		}
		case RETRO_ENVIRONMENT_GET_CAN_DUPE: {
			bool *dupe = data;

			*dupe = true;

			return true;
		}
		case RETRO_ENVIRONMENT_GET_LOG_INTERFACE: {
			struct retro_log_callback *callback = data;

			callback->log = core_log_cb;

			return true;
		}
		case RETRO_ENVIRONMENT_GET_SYSTEM_DIRECTORY: {
			const char **system_directory = data;

			*system_directory = CTX.paths[JUN_PATH_SYSTEM];

			return true;
		}
		case RETRO_ENVIRONMENT_GET_SAVE_DIRECTORY: {
			const char **save_directory = data;

			*save_directory = CTX.paths[JUN_PATH_SAVES];

			return true;
		}
		case RETRO_ENVIRONMENT_GET_VFS_INTERFACE & ~RETRO_ENVIRONMENT_EXPERIMENTAL: {
			struct retro_vfs_interface_info *vfs = data;

			return false;
		}
		case RETRO_ENVIRONMENT_SET_MESSAGE: {
			struct retro_message *message = data;

			LOG("%s", message->msg);

			return true;
		}
		case RETRO_ENVIRONMENT_SET_VARIABLES: {
			const struct retro_variable *variables = data;

			for (int8_t i = 0; i < INT8_MAX; i++) {
				const struct retro_variable *variable = &variables[i];

				if (!variable->key || !variable->value)
					break;

				LOG("SET -> %s: %s", variable->key, variable->value);

				char *value = strdup(variable->value);

				CTX.variables[i].key = strdup(variable->key);

				char *ptr = NULL;
				CTX.variables[i].name = strdup(strtok_r(value, ";", &ptr));
				CTX.variables[i].options = strdup(strtok_r(NULL, ";", &ptr) + 1);

				char *options = strdup(CTX.variables[i].options);
				CTX.variables[i].value = strdup(strtok_r(options, "|", &ptr));
				free(options);

				free(value);
			}

			JunieInteropVariables(CTX.variables);

			return true;
		}
		case RETRO_ENVIRONMENT_GET_VARIABLE: {
			struct retro_variable *variable = data;

			for (int8_t i = 0; i < INT8_MAX; i++) {
				if (!CTX.variables[i].key)
					break;

				if (strcmp(CTX.variables[i].key, variable->key))
					continue;

				variable->value = CTX.variables[i].value;

				break;
			}

			LOG("GET -> %s: %s", variable->key, variable->value);

			return variable->value != NULL;
		}
		case RETRO_ENVIRONMENT_GET_VARIABLE_UPDATE: {
			bool *update = data;

			*update = CTX.variables_update;
			CTX.variables_update = false;

			return true;
		}
		case RETRO_ENVIRONMENT_SET_CONTENT_INFO_OVERRIDE: {
			CTX.content_overrides = data;

			return true;
		}
		case RETRO_ENVIRONMENT_GET_GAME_INFO_EXT: {
			const struct retro_game_info_ext **game = data;

			*game = &CTX.game_ext;

			return true;
		}
		case RETRO_ENVIRONMENT_GET_AUDIO_VIDEO_ENABLE & ~RETRO_ENVIRONMENT_EXPERIMENTAL: {
			int *status = data;

			*status = 0;     // Reset
			*status |= 0b01; // Enable video
			*status |= 0b10; // Enable audio

			return true;
		}
		case RETRO_ENVIRONMENT_SET_SYSTEM_AV_INFO: {
			struct retro_system_av_info *av = data;

			CTX.av = *av;

			return true;
		}
		case RETRO_ENVIRONMENT_SET_GEOMETRY: {
			struct retro_game_geometry *geometry = data;

			CTX.av.geometry = *geometry;

			return true;
		}
		default: {
			LOG("Unhandled command: %d", command);

			return false;
		}
	}
}

static void video_refresh(const void *data, unsigned width, unsigned height, size_t pitch)
{
	if (!data)
		return;

	CTX.video.data = data;
	CTX.video.width = width;
	CTX.video.height = height;
	CTX.video.pitch = pitch;

	CTX.video.ratio = CTX.av.geometry.aspect_ratio <= 0
		? (float) width / (float) height
		: CTX.av.geometry.aspect_ratio;

	JunieInteropVideo(&CTX.video);
}

static size_t audio_sample_batch(const int16_t *data, size_t frames)
{
	if (!CTX.audio.enable)
		return frames;

	size_t new_size = (CTX.audio.frames + frames) * 2 * sizeof(int16_t);
	if (new_size > CTX.audio.size) {
		CTX.audio.data = realloc((void *) CTX.audio.data, new_size);
		CTX.audio.size = new_size;
	}

	const int16_t *current = &CTX.audio.data[CTX.audio.frames * 2];
	memcpy((void *) current, (void *) data, frames * 2 * sizeof(int16_t));

	CTX.audio.frames += frames;
	CTX.audio.rate = CTX.av.timing.sample_rate * CTX.speed;

	if (CTX.audio.frames >= CTX.audio.rate / (CTX.av.timing.fps * CTX.speed)) {
		JunieInteropAudio(&CTX.audio);
		CTX.audio.frames = 0;
	}

	return frames;
}

static void audio_sample(int16_t left, int16_t right)
{
	audio_sample_batch((int16_t[]) { left, right }, 1);
}

static void input_poll()
{
	// NOOP
}

static int16_t input_state(unsigned port, unsigned device, unsigned index, unsigned id)
{
	if (port != 0)
		return 0;

	if (device == RETRO_DEVICE_JOYPAD)
		return CTX.inputs[id];

	if (device == RETRO_DEVICE_POINTER) {
		switch (id) {
			case RETRO_DEVICE_ID_POINTER_PRESSED:
				return CTX.pointer.pressed;
			case RETRO_DEVICE_ID_POINTER_X:
				return (((double) CTX.pointer.x * 0x10000) / (double) CTX.video.width) - 0x8000;
			case RETRO_DEVICE_ID_POINTER_Y:
				return (((double) CTX.pointer.y * 0x10000) / (double) CTX.video.height) - 0x8000;
		}
	}

	return 0;
}

static char *remove_extension(const char *str)
{
	if (!str)
		return NULL;

	char *dot = strrchr(str, '.');
	if (dot == NULL)
		return strdup(str);

	size_t length = (size_t) dot - (size_t) str;
	char *result = calloc(length + 1, 1);
	memcpy(result, str, length);

	return result;
}

static char *get_extension(const char *str)
{
	if (!str)
		return NULL;

	const char *dot = strrchr(str, '.');
	if (!dot || !dot[1])
		return strdup("");

	char *extension = strdup(dot + 1);
	for (size_t i = 0; extension[i]; i++)
		if (extension[i] >= 'A' && extension[i] <= 'Z')
			extension[i] += 'a' - 'A';

	return extension;
}

static bool extension_matches(const char *extensions, const char *extension)
{
	if (!extensions || !extension)
		return false;

	size_t extension_length = strlen(extension);
	const char *current = extensions;

	while (*current) {
		const char *end = strchr(current, '|');
		size_t length = end ? (size_t) (end - current) : strlen(current);

		if (length == extension_length && !strncmp(current, extension, length))
			return true;

		if (!end)
			break;

		current = end + 1;
	}

	return false;
}

static const struct retro_system_content_info_override *content_override_for_game()
{
	for (const struct retro_system_content_info_override *override = CTX.content_overrides;
			override && override->extensions; override++) {
		if (extension_matches(override->extensions, CTX.game_extension))
			return override;
	}

	return NULL;
}

static bool game_needs_fullpath()
{
	const struct retro_system_content_info_override *override = content_override_for_game();

	return override ? override->need_fullpath : CTX.system.need_fullpath;
}

static bool game_data_is_persistent()
{
	const struct retro_system_content_info_override *override = content_override_for_game();

	return override ? override->persistent_data : false;
}

static void create_paths(const char *system, const char *rom)
{
	char *game = remove_extension(rom);

	CTX.paths[JUN_PATH_SYSTEM] = core_strfmt("/%s",             system);
	CTX.paths[JUN_PATH_GAME] =   core_strfmt("/%s/%s",          system, rom);
	CTX.paths[JUN_PATH_SAVES] =  core_strfmt("/%s/%s",          system, game);
	CTX.paths[JUN_PATH_STATE] =  core_strfmt("/%s/%s/%s.state", system, game, game);
	CTX.paths[JUN_PATH_SRAM] =   core_strfmt("/%s/%s/%s.srm",   system, game, game);
	CTX.paths[JUN_PATH_RTC] =    core_strfmt("/%s/%s/%s.rtc",   system, game, game);
	CTX.paths[JUN_PATH_CHEATS] = core_strfmt("/%s/%s/%s.cht",   system, game, game);
	CTX.game_name = strdup(game);
	CTX.game_extension = get_extension(rom);

	free(game);
}

static void core_lock()
{
	slock_lock(CTX.mutex);
	uint64_t queue_me = CTX.queue_tail++;
	while (queue_me != CTX.queue_head)
		scond_wait(CTX.cond, CTX.mutex);
	slock_unlock(CTX.mutex);
}

static void core_unlock()
{
	slock_lock(CTX.mutex);
	CTX.queue_head++;
	scond_broadcast(CTX.cond);
	slock_unlock(CTX.mutex);
}

static bool core_should_run()
{
	static double timestamp = 0;
	static double remaining_frames = 0;

	if (timestamp == 0) {
		timestamp = core_get_ticks();
		return true;
	}

	double current = core_get_ticks();
	double total_loop = current - timestamp;
	timestamp = current;

	if (total_loop > 0) {
		double expected_frames = CTX.av.timing.fps * CTX.speed;
		remaining_frames += expected_frames / (1000.0 / total_loop);
	}

	double pending = 0;
	remaining_frames = modf(remaining_frames, &pending);

	return pending >= 1;
}

static void save_memory(uint32_t type, const char *path)
{
	void *buffer = CTX.sym.retro_get_memory_data(type);
	if (!buffer)
		return;

	size_t size = CTX.sym.retro_get_memory_size(type);
	if (!size)
		return;

	if (CTX.memory == NULL || CTX.memory_size != size || memcmp(CTX.memory, buffer, size)) {
		FILE *file = fopen(path, "w+");
		fwrite(buffer, 1, size, file);
		fclose(file);

		free(CTX.memory);
		CTX.memory = calloc(size, 1);
		CTX.memory_size = size;
		memcpy(CTX.memory, buffer, size);
	}
}

static void save_memories()
{
	const char *sram_path = CTX.paths[JUN_PATH_SRAM];
	const char *rtc_path = CTX.paths[JUN_PATH_RTC];

	save_memory(RETRO_MEMORY_SAVE_RAM, sram_path);
	save_memory(RETRO_MEMORY_RTC, rtc_path);
}

static void restore_memory(uint32_t type, const char *path)
{
	void *buffer = CTX.sym.retro_get_memory_data(type);
	if (!buffer)
		return;

	size_t size = CTX.sym.retro_get_memory_size(type);
	if (!size)
		return;

	FILE *file = fopen(path, "r");
	if (!file)
		return;

	fread(buffer, 1, size, file);
	fclose(file);
}

static void restore_memories()
{
	const char *sram_path = CTX.paths[JUN_PATH_SRAM];
	const char *rtc_path = CTX.paths[JUN_PATH_RTC];

	restore_memory(RETRO_MEMORY_SAVE_RAM, sram_path);
	restore_memory(RETRO_MEMORY_RTC, rtc_path);
}

static void core_thread(void *opaque)
{
	while (!CTX.destroying) {
		if (!core_should_run()) {
			core_sleep(1);
			continue;
		}

		core_lock();
		CTX.run_entered++;
		CTX.sym.retro_run();
		CTX.run_returned++;
		core_unlock();
	}
}

static void memory_thread(void *opaque)
{
	while (!CTX.destroying) {
		save_memories();
		core_sleep(1000);
	}
	save_memories();
}

void JunieCreate(const char *system, const char *rom)
{
	setbuf(stdout, NULL);

	CTX.speed = 1;

	create_paths(system, rom);
	JunieInteropInit(&CTX.sym);

	CTX.sym.retro_set_environment(environment);
	CTX.sym.retro_set_video_refresh(video_refresh);
	CTX.sym.retro_set_input_poll(input_poll);
	CTX.sym.retro_set_input_state(input_state);
	CTX.sym.retro_set_audio_sample(audio_sample);
	CTX.sym.retro_set_audio_sample_batch(audio_sample_batch);
}

static void set_core_callbacks()
{
	CTX.sym.retro_set_video_refresh(video_refresh);
	CTX.sym.retro_set_input_poll(input_poll);
	CTX.sym.retro_set_input_state(input_state);
	CTX.sym.retro_set_audio_sample(audio_sample);
	CTX.sym.retro_set_audio_sample_batch(audio_sample_batch);
}

bool JunieStartGame()
{
	CTX.sym.retro_init();
	set_core_callbacks();
	CTX.sym.retro_get_system_info(&CTX.system);

	CTX.game.path = CTX.paths[JUN_PATH_GAME];
	bool needs_fullpath = game_needs_fullpath();

	FILE *file = fopen(CTX.game.path, "r");
	if (file) {
		fseek(file, 0, SEEK_END);
		CTX.game.size = ftell(file);

		if (!needs_fullpath) {
			fseek(file, 0, SEEK_SET);
			CTX.game.data = calloc(CTX.game.size, 1);
			size_t read = fread((void *) CTX.game.data, 1, CTX.game.size, file);
			if (read != CTX.game.size) {
				fclose(file);
				core_set_error("Could not read the complete game file: %s", CTX.game.path);
				return false;
			}
		}

		fclose(file);
	} else {
		core_set_error("Game file was not found in browser storage: %s", CTX.game.path);
		return false;
	}

	CTX.game_ext.full_path = CTX.paths[JUN_PATH_GAME];
	CTX.game_ext.dir = CTX.paths[JUN_PATH_SYSTEM];
	CTX.game_ext.name = CTX.game_name;
	CTX.game_ext.ext = CTX.game_extension;
	CTX.game_ext.data = CTX.game.data;
	CTX.game_ext.size = CTX.game.size;
	CTX.game_ext.persistent_data = game_data_is_persistent();

	CTX.initialized = CTX.sym.retro_load_game(&CTX.game);

	if (!CTX.initialized) {
		core_set_error("The %s core rejected this game: %s", CTX.system.library_name, CTX.game.path);
		return CTX.initialized;
	}

	CTX.sym.retro_get_system_av_info(&CTX.av);
	CTX.sym.retro_set_controller_port_device(0, RETRO_DEVICE_JOYPAD);

	restore_memories();

	CTX.mutex = slock_new();
	CTX.cond = scond_new();
	CTX.core_thread = sthread_create(core_thread, NULL);
	CTX.memory_thread = sthread_create(memory_thread, NULL);

	if (!CTX.mutex || !CTX.cond || !CTX.core_thread || !CTX.memory_thread) {
		core_set_error("Could not start core threads.");
		return false;
	}

	return CTX.initialized;
}

const char *JunieGetError()
{
	return CTX.error;
}

char *JunieGetStatus()
{
	return core_strfmt(
		"run_entered=%llu run_returned=%llu fps=%f sample_rate=%f width=%u height=%u",
		(unsigned long long) CTX.run_entered,
		(unsigned long long) CTX.run_returned,
		CTX.av.timing.fps,
		CTX.av.timing.sample_rate,
		CTX.av.geometry.base_width,
		CTX.av.geometry.base_height
	);
}

void JunieDestroy()
{
	CTX.destroying = true;
	if (CTX.core_thread)
		sthread_join(CTX.core_thread);
	if (CTX.memory_thread)
		sthread_join(CTX.memory_thread);
	if (CTX.cond)
		scond_free(CTX.cond);
	if (CTX.mutex)
		slock_free(CTX.mutex);

	CTX.sym.retro_deinit();

	for (int8_t i = 0; i < INT8_MAX; i++) {
		if (!CTX.variables[i].key)
			break;

		free(CTX.variables[i].key);
		free(CTX.variables[i].name);
		free(CTX.variables[i].options);
		free(CTX.variables[i].value);
	}

	for (size_t i = 0; i < JUN_PATH_MAX; i++)
		free(CTX.paths[i]);

	free(CTX.game_name);
	free(CTX.game_extension);
	free(CTX.error);
	free(CTX.memory);
	free((void *) CTX.game.data);

	CTX = (struct CTX) {0};
}

void JunieSetAudio(bool enable)
{
	CTX.audio.enable = enable;
}

void JunieSetSpeed(uint8_t speed)
{
	CTX.speed = speed;
}

void JunieSetInput(JunieInputDevice device, JunieInputID id, int16_t value)
{
	if (device == RETRO_DEVICE_JOYPAD)
		CTX.inputs[id] = value;

	if (device == RETRO_DEVICE_POINTER) {
		switch (id) {
			case RETRO_DEVICE_ID_POINTER_PRESSED:
				CTX.pointer.pressed = value;
				break;
			case RETRO_DEVICE_ID_POINTER_X:
				CTX.pointer.x = value;
				break;
			case RETRO_DEVICE_ID_POINTER_Y:
				CTX.pointer.y = value;
				break;
			default:
				break;
		}
	}
}

void JunieSetVariables(const JunieVariable *variables)
{
	core_lock();

	while (variables->key != NULL) {
		for (int8_t i = 0; i < INT8_MAX; i++) {
			if (!CTX.variables[i].key)
				break;

			if (strcmp(CTX.variables[i].key, variables->key))
				continue;

			if (strcmp(CTX.variables[i].value, variables->value)) {
				free(CTX.variables[i].value);
				CTX.variables[i].value = strdup(variables->value);
				CTX.variables_update = true;
			}

			break;
		}

		variables++;
	}

	core_unlock();
}

void JunieSetCheats(const JunieCheat *cheats)
{
	core_lock();

	CTX.sym.retro_cheat_reset();

	while (cheats->code != NULL) {
		char *value = strdup(cheats->code);
		for (size_t i = 0; i < strlen(value); i++)
			if (value[i] == ' ' || value[i] == '\n')
				value[i] = '+';

		CTX.sym.retro_cheat_set(cheats->index, cheats->enabled, value);
		free(value);

		cheats++;
	}

	core_unlock();
}

void JunieSaveState()
{
	core_lock();

	size_t size = CTX.sym.retro_serialize_size();

	void *data = calloc(size, 1);

	CTX.sym.retro_serialize(data, size);

	FILE *file = fopen(CTX.paths[JUN_PATH_STATE], "w+");
	fwrite(data, 1, size, file);
	fclose(file);

	free(data);

	core_unlock();
}

void JunieRestoreState()
{
	core_lock();

	size_t size = CTX.sym.retro_serialize_size();
	if (!size)
		return;

	FILE *file = fopen(CTX.paths[JUN_PATH_STATE], "r");
	if (!file)
		return;

	void *buffer = calloc(size, 1);
	fread(buffer, 1, size, file);
	CTX.sym.retro_unserialize(buffer, size);

	free(buffer);
	fclose(file);

	core_unlock();
}
