#include "vfs.h"

#include <dirent.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>

struct retro_vfs_file_handle {
	FILE *file;
	char *path;
};

struct retro_vfs_dir_handle {
	DIR *directory;
	struct dirent *entry;
	bool include_hidden;
};

static const char *vfs_mode(unsigned mode)
{
	bool read = mode & RETRO_VFS_FILE_ACCESS_READ;
	bool write = mode & RETRO_VFS_FILE_ACCESS_WRITE;
	bool update = mode & RETRO_VFS_FILE_ACCESS_UPDATE_EXISTING;

	if (read && write)
		return update ? "r+b" : "w+b";
	if (write)
		return update ? "r+b" : "wb";
	return read ? "rb" : NULL;
}

static const char *vfs_get_path(struct retro_vfs_file_handle *stream)
{
	return stream ? stream->path : NULL;
}

static struct retro_vfs_file_handle *vfs_open(const char *path, unsigned mode, unsigned hints)
{
	const char *access = vfs_mode(mode);
	if (!path || !access)
		return NULL;

	FILE *file = fopen(path, access);
	if (!file)
		return NULL;

	struct retro_vfs_file_handle *stream = calloc(1, sizeof(*stream));
	if (!stream) {
		fclose(file);
		return NULL;
	}

	stream->file = file;
	stream->path = strdup(path);
	return stream;
}

static int vfs_close(struct retro_vfs_file_handle *stream)
{
	if (!stream)
		return -1;

	int result = fclose(stream->file);
	free(stream->path);
	free(stream);
	return result == 0 ? 0 : -1;
}

static int64_t vfs_size(struct retro_vfs_file_handle *stream)
{
	if (!stream)
		return -1;

	long position = ftell(stream->file);
	if (position < 0 || fseek(stream->file, 0, SEEK_END) != 0)
		return -1;

	long size = ftell(stream->file);
	fseek(stream->file, position, SEEK_SET);
	return size;
}

static int64_t vfs_tell(struct retro_vfs_file_handle *stream)
{
	return stream ? ftell(stream->file) : -1;
}

static int64_t vfs_seek(struct retro_vfs_file_handle *stream, int64_t offset, int seek_position)
{
	if (!stream)
		return -1;

	int origin = seek_position == RETRO_VFS_SEEK_POSITION_START ? SEEK_SET
		: seek_position == RETRO_VFS_SEEK_POSITION_CURRENT ? SEEK_CUR
		: seek_position == RETRO_VFS_SEEK_POSITION_END ? SEEK_END : -1;
	if (origin == -1 || fseek(stream->file, offset, origin) != 0)
		return -1;

	return ftell(stream->file);
}

static int64_t vfs_read(struct retro_vfs_file_handle *stream, void *data, uint64_t length)
{
	if (!stream || !data)
		return -1;

	size_t read = fread(data, 1, length, stream->file);
	return ferror(stream->file) ? -1 : read;
}

static int64_t vfs_write(struct retro_vfs_file_handle *stream, const void *data, uint64_t length)
{
	if (!stream || !data)
		return -1;

	size_t written = fwrite(data, 1, length, stream->file);
	return written == length ? written : -1;
}

static int vfs_flush(struct retro_vfs_file_handle *stream)
{
	return stream && fflush(stream->file) == 0 ? 0 : -1;
}

static int vfs_remove(const char *path)
{
	return path && remove(path) == 0 ? 0 : -1;
}

static int vfs_rename(const char *old_path, const char *new_path)
{
	return old_path && new_path && rename(old_path, new_path) == 0 ? 0 : -1;
}

static int64_t vfs_truncate(struct retro_vfs_file_handle *stream, int64_t length)
{
	if (!stream || length < 0 || fflush(stream->file) != 0 || truncate(stream->path, length) != 0)
		return -1;

	return 0;
}

static int vfs_stat(const char *path, int32_t *size)
{
	if (!path)
		return 0;

	struct retro_vfs_file_handle *file = vfs_open(path, RETRO_VFS_FILE_ACCESS_READ, RETRO_VFS_FILE_ACCESS_HINT_NONE);
	if (file) {
		int64_t length = vfs_size(file);
		vfs_close(file);

		if (length < 0)
			return 0;
		if (size)
			*size = length > INT32_MAX ? INT32_MAX : length;
		return RETRO_VFS_STAT_IS_VALID;
	}

	DIR *directory = opendir(path);
	if (!directory)
		return 0;
	closedir(directory);

	if (size)
		*size = 0;
	return RETRO_VFS_STAT_IS_VALID | RETRO_VFS_STAT_IS_DIRECTORY;
}

static int vfs_mkdir(const char *path)
{
	if (!path)
		return -1;
	if (mkdir(path, 0777) == 0)
		return 0;

	DIR *directory = opendir(path);
	if (!directory)
		return -1;
	closedir(directory);
	return -2;
}

static struct retro_vfs_dir_handle *vfs_opendir(const char *path, bool include_hidden)
{
	if (!path)
		return NULL;

	DIR *directory = opendir(path);
	if (!directory)
		return NULL;

	struct retro_vfs_dir_handle *stream = calloc(1, sizeof(*stream));
	if (!stream) {
		closedir(directory);
		return NULL;
	}

	stream->directory = directory;
	stream->include_hidden = include_hidden;
	return stream;
}

static bool vfs_readdir(struct retro_vfs_dir_handle *stream)
{
	if (!stream)
		return false;

	while ((stream->entry = readdir(stream->directory))) {
		const char *name = stream->entry->d_name;
		if (strcmp(name, ".") && strcmp(name, "..") && (stream->include_hidden || name[0] != '.'))
			return true;
	}

	return false;
}

static const char *vfs_dirent_get_name(struct retro_vfs_dir_handle *stream)
{
	return stream && stream->entry ? stream->entry->d_name : NULL;
}

static bool vfs_dirent_is_dir(struct retro_vfs_dir_handle *stream)
{
	return stream && stream->entry && stream->entry->d_type == DT_DIR;
}

static int vfs_closedir(struct retro_vfs_dir_handle *stream)
{
	if (!stream)
		return -1;

	int result = closedir(stream->directory);
	free(stream);
	return result == 0 ? 0 : -1;
}

struct retro_vfs_interface *GamejinVfsInterface(void)
{
	static struct retro_vfs_interface interface = {
		.get_path = vfs_get_path,
		.open = vfs_open,
		.close = vfs_close,
		.size = vfs_size,
		.tell = vfs_tell,
		.seek = vfs_seek,
		.read = vfs_read,
		.write = vfs_write,
		.flush = vfs_flush,
		.remove = vfs_remove,
		.rename = vfs_rename,
		.truncate = vfs_truncate,
		.stat = vfs_stat,
		.mkdir = vfs_mkdir,
		.opendir = vfs_opendir,
		.readdir = vfs_readdir,
		.dirent_get_name = vfs_dirent_get_name,
		.dirent_is_dir = vfs_dirent_is_dir,
		.closedir = vfs_closedir,
	};

	return &interface;
}
