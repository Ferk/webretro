#pragma once

#include "libretro.h"

typedef enum {
	GAMEJIN_DEVICE_JOYPAD  = RETRO_DEVICE_JOYPAD,
	GAMEJIN_DEVICE_POINTER = RETRO_DEVICE_POINTER,
} GamejinInputDevice;

typedef enum {
	GAMEJIN_DEVICE_ID_JOYPAD_B      = RETRO_DEVICE_ID_JOYPAD_B,
	GAMEJIN_DEVICE_ID_JOYPAD_Y      = RETRO_DEVICE_ID_JOYPAD_Y,
	GAMEJIN_DEVICE_ID_JOYPAD_SELECT = RETRO_DEVICE_ID_JOYPAD_SELECT,
	GAMEJIN_DEVICE_ID_JOYPAD_START  = RETRO_DEVICE_ID_JOYPAD_START,
	GAMEJIN_DEVICE_ID_JOYPAD_UP     = RETRO_DEVICE_ID_JOYPAD_UP,
	GAMEJIN_DEVICE_ID_JOYPAD_DOWN   = RETRO_DEVICE_ID_JOYPAD_DOWN,
	GAMEJIN_DEVICE_ID_JOYPAD_LEFT   = RETRO_DEVICE_ID_JOYPAD_LEFT,
	GAMEJIN_DEVICE_ID_JOYPAD_RIGHT  = RETRO_DEVICE_ID_JOYPAD_RIGHT,
	GAMEJIN_DEVICE_ID_JOYPAD_A      = RETRO_DEVICE_ID_JOYPAD_A,
	GAMEJIN_DEVICE_ID_JOYPAD_X      = RETRO_DEVICE_ID_JOYPAD_X,
	GAMEJIN_DEVICE_ID_JOYPAD_L      = RETRO_DEVICE_ID_JOYPAD_L,
	GAMEJIN_DEVICE_ID_JOYPAD_R      = RETRO_DEVICE_ID_JOYPAD_R,
	GAMEJIN_DEVICE_ID_JOYPAD_L2     = RETRO_DEVICE_ID_JOYPAD_L2,
	GAMEJIN_DEVICE_ID_JOYPAD_R2     = RETRO_DEVICE_ID_JOYPAD_R2,
	GAMEJIN_DEVICE_ID_JOYPAD_L3     = RETRO_DEVICE_ID_JOYPAD_L3,
	GAMEJIN_DEVICE_ID_JOYPAD_R3     = RETRO_DEVICE_ID_JOYPAD_R3,

	GAMEJIN_DEVICE_ID_POINTER_X       = RETRO_DEVICE_ID_POINTER_X,
	GAMEJIN_DEVICE_ID_POINTER_Y       = RETRO_DEVICE_ID_POINTER_Y,
	GAMEJIN_DEVICE_ID_POINTER_PRESSED = RETRO_DEVICE_ID_POINTER_PRESSED,
	GAMEJIN_DEVICE_ID_POINTER_COUNT   = RETRO_DEVICE_ID_POINTER_COUNT,
} GamejinInputID;

typedef struct {
	void (*retro_init)(void);
	bool (*retro_load_game)(const struct retro_game_info *game);
	void (*retro_get_system_info)(struct retro_system_info *info);
	void (*retro_get_system_av_info)(struct retro_system_av_info *info);
	void (*retro_set_environment)(retro_environment_t);
	void (*retro_set_video_refresh)(retro_video_refresh_t);
	void (*retro_set_input_poll)(retro_input_poll_t);
	void (*retro_set_input_state)(retro_input_state_t);
	void (*retro_set_audio_sample)(retro_audio_sample_t);
	void (*retro_set_audio_sample_batch)(retro_audio_sample_batch_t);
	void (*retro_set_controller_port_device)(unsigned port, unsigned device);
	size_t (*retro_get_memory_size)(unsigned type);
	void *(*retro_get_memory_data)(unsigned type);
	size_t (*retro_serialize_size)(void);
	bool (*retro_serialize)(void *data, size_t size);
	bool (*retro_unserialize)(const void *data, size_t size);
	void (*retro_cheat_reset)();
	void (*retro_cheat_set)(unsigned index, bool enabled, const char *code);
	void (*retro_run)(void);
	void (*retro_reset)(void);
	void (*retro_unload_game)(void);
	void (*retro_deinit)(void);
} GamejinSymbols;

typedef struct {
	const void *data;
	enum retro_pixel_format format;
	uint32_t width;
	uint32_t height;
	size_t pitch;
	float ratio;
} GamejinVideo;

typedef struct {
	const int16_t *data;
	float rate;
	size_t frames;
	size_t size;
	bool enable;
} GamejinAudio;

typedef struct {
	char *key;
	char *value;
	char *name;
	char *options;
} GamejinVariable;

typedef struct {
	uint32_t index;
	bool enabled;
	char *code;
} GamejinCheat;

typedef struct {
	const char *library_name;
	const char *library_version;
	const char *valid_extensions;
	bool need_fullpath;
	bool block_extract;
	bool support_no_game;
} GamejinCoreInfo;

GamejinCoreInfo *GamejinProbeCore();
void GamejinCreate(const char *system, const char *rom, bool content_required);
bool GamejinStartGame();
const char *GamejinGetError();
char *GamejinGetStatus();
void GamejinDestroy();

void GamejinSetSpeed(uint8_t speed);
void GamejinSetInput(GamejinInputDevice device, GamejinInputID id, int16_t value);
void GamejinSetVariables(const GamejinVariable *variables);
void GamejinSetCheats(const GamejinCheat *cheats);

void GamejinSaveState();
void GamejinRestoreState();
