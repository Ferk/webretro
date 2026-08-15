WASI_VERSION = wasi-sdk-24

# Detect the OS and architecture, and set the WASI_BUILD variable accordingly
UNAME_S := $(shell uname -s)
UNAME_M := $(shell uname -m)

ifeq ($(UNAME_S), Linux)
    ifeq ($(UNAME_M), x86_64)
        WASI_BUILD = $(WASI_VERSION).0-x86_64-linux
    else ifeq ($(UNAME_M), arm64)
        WASI_BUILD = $(WASI_VERSION).0-arm64-linux
    else
        $(error Unsupported architecture: $(UNAME_M))
    endif
else ifeq ($(UNAME_S), Darwin)
    ifeq ($(UNAME_M), x86_64)
        WASI_BUILD = $(WASI_VERSION).0-x86_64-macos
    else ifeq ($(UNAME_M), arm64)
        WASI_BUILD = $(WASI_VERSION).0-arm64-macos
    else
        $(error Unsupported architecture: $(UNAME_M))
    endif
else
    $(error Unsupported OS: $(UNAME_S))
endif

DEFINES := -D__EMSCRIPTEN__ -I$(DEPS_DIR)/libretro-common/include
include ../GNUmakefile.common

all: wasi-sdk zlib libretro-common libz.a libretro.a

wasi-sdk:
	@echo Fetching wasi-sdk...
	@wget https://github.com/WebAssembly/wasi-sdk/releases/download/$(WASI_VERSION)/$(WASI_BUILD).tar.gz $(QUIET)
	@mkdir wasi-sdk && tar xvf $(WASI_BUILD).tar.gz -C wasi-sdk --strip-components 1 $(QUIET)
	@rm $(WASI_BUILD).tar.gz

libretro-common:
	@if test -d libretro-common; then \
		echo Using vendored libretro-common...; \
	else \
		echo "Missing dependency source: deps/libretro-common" >&2; \
		echo "Run git submodule update --init --recursive." >&2; \
		exit 1; \
	fi

zlib:
	@if test -d zlib; then \
		echo Using vendored zlib...; \
	else \
		echo "Missing dependency source: deps/zlib" >&2; \
		echo "Run git submodule update --init --recursive." >&2; \
		exit 1; \
	fi

OBJ = \
	libretro-common/file/file_path.o \
	libretro-common/file/file_path_io.o \
	libretro-common/file/config_file.o \
	libretro-common/file/config_file_userdata.o \
	libretro-common/streams/file_stream.o \
	libretro-common/streams/file_stream_transforms.o \
	libretro-common/vfs/vfs_implementation.o \
	libretro-common/string/stdstring.o \
	libretro-common/lists/string_list.o \
	libretro-common/compat/compat_strl.o \
	libretro-common/rthreads/rthreads.o \
	libretro-common/features/features_cpu.o \
	libretro-common/audio/conversion/float_to_s16.o \
	libretro-common/audio/conversion/s16_to_float.o \
	libretro-common/encodings/encoding_crc32.o \
	libretro-common/encodings/encoding_deflate.o \
	libretro-common/audio/resampler/audio_resampler.o \
	libretro-common/audio/resampler/drivers/sinc_resampler.o

ZLIB_OBJ = \
	zlib/adler32.o \
	zlib/crc32.o \
	zlib/deflate.o \
	zlib/infback.o \
	zlib/inffast.o \
	zlib/inflate.o \
	zlib/inftrees.o \
	zlib/trees.o \
	zlib/zutil.o \
	zlib/compress.o \
	zlib/uncompr.o

libz.a: $(ZLIB_OBJ)
	@echo Building libz.a...
	@$(AR) rcs $@ $^
	@$(RANLIB) $@

libretro.a:
	@echo Building libretro.a...
	@$(MAKE) $(OBJ) $(QUIET)
	@$(AR) rcs libretro.a $(OBJ)

clean:
	@rm -f $(OBJ) $(ZLIB_OBJ) zlib/zconf.h libretro.a libz.a

%.o: %.c
	@$(CC) -c -o $@ -Ilibretro-common/include $^ $(QUIET)

zlib/%.o: zlib/%.c zlib/zconf.h
	@$(CC) -DHAVE_UNISTD_H=1 -c -o $@ $< $(QUIET)

zlib/zconf.h: zlib/zconf.h.in
	@cp $< $@
