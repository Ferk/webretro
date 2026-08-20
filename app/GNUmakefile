OUT_DIR := build

EXPORTS := $(addprefix -Wl$(shell echo ,)--export=, $(shell cat `pwd`/exports.txt))

SRC_DIR  := sources
DEPS_DIR := ../deps
DEPS     := $(DEPS_DIR)/libz.a $(DEPS_DIR)/libretro.a

CORES_DIR := ../cores
CORES     := $(shell jq -r 'keys[]' $(CORES_DIR)/cores.json)

DEFINES := \
	-I$(DEPS_DIR)/libretro-common/include

LDFLAGS := \
	-lwasi-emulated-mman -fwasm-exceptions \
	-lsetjmp \
	-mexec-model=reactor -Wl,--no-entry \
	-Wl,--export=calloc,--export=free,--export=realloc \
	-Wl,--initial-memory=$$((200 * 1024 * 1024)) \
	-Wl,--max-memory=$$((600 * 1024 * 1024)) \
	-Wl,--import-memory,--export-memory

OBJ := \
	$(SRC_DIR)/junie.o \
	$(SRC_DIR)/interop-web.o

include ../GNUmakefile.common

all: clean prepare
	@echo Building objects...
	@$(MAKE) -s $(OBJ)
	@$(MAKE) -s $(CORES:%=$(OUT_DIR)/%.wasm)

prepare:
	@mkdir -p $(OUT_DIR)

$(OUT_DIR)/%.wasm: $(OBJ) $(DEPS) $(CORES_DIR)/lib%.a exports.txt
	@echo Building $*.wasm...
	@extras=`jq -r '."$*".linkArchives[]? // empty' $(CORES_DIR)/cores.json | sed 's#^#$(CORES_DIR)/#'` && \
	link_flags=`jq -r '."$*".linkFlags[]? // empty' $(CORES_DIR)/cores.json` && \
	core_archive="$(CORES_DIR)/lib$*.a" && \
	if test "`jq -r '."$*".wholeArchive // false' $(CORES_DIR)/cores.json`" = true; then \
		core_archive="-Wl,--whole-archive $$core_archive -Wl,--no-whole-archive"; \
	fi && \
	$(CXX) -o $(OUT_DIR)/$*.wasm $(OBJ) $(DEPS) $$core_archive $$extras \
		$(LDFLAGS) $$link_flags $(EXPORTS) $(QUIET)

clean:
	@rm -rf $(OBJ) $(OUT_DIR)

%.o: %.c
	@$(CC) -c -o $@ $^ $(QUIET)
