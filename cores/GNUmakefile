LIBRARIES := $(shell jq -r 'keys[]' cores.json)

DEFINES := -D__EMSCRIPTEN__
include ../GNUmakefile.common

BUILD_JOBS := -j 8
ifeq ($(GITHUB_ACTIONS),true)
BUILD_JOBS := -j 1
QUIET :=
endif
BUILD_FLAGS := \
	$(BUILD_JOBS) platform=emscripten HAVE_OPENGL=0 STATIC_LINKING=1 \
	CC="$(CC)" CXX="$(CXX)" AR="$(AR)" RANLIB="$(RANLIB)"
CORE_FLAGS := HAVE_OPENGL=0 STATIC_LINKING=1 AR="$(AR)" RANLIB="$(RANLIB)"

all: $(LIBRARIES:%=lib%.a)

clean: $(LIBRARIES:%=clean-%)

fetch-%:
	@name=`jq -r '."$*".repository // "$*"' cores.json` && \
	if test -d "$$name"; then \
		echo Using vendored $$name...; \
	else \
		echo "Missing core source: cores/$$name" >&2; \
		echo "Run git submodule update --init --recursive or add the core as a submodule." >&2; \
		exit 1; \
	fi

lib%.a: fetch-%
	@target=`pwd`/lib$*.a && \
	name=`jq -r '."$*".repository // "$*"' cores.json` && \
	makedir=`jq -r '."$*".directory // ""' cores.json` && \
	makefile=`jq -r '."$*".makefile // "Makefile"' cores.json` && \
	cmake=`jq -r '."$*".cmake // false' cores.json` && \
	platform=`jq -r '."$*".platform // "emscripten"' cores.json` && \
	cmake_c_flags='$(DEFINES)' && \
	cmake_cxx_flags='$(DEFINES)' && \
	extra_flags=`jq -r '."$*".buildFlags[]? // empty' cores.json` && \
	c_flags=`jq -r '."$*".cFlags // ""' cores.json` && \
	cxx_flags=`jq -r '."$*".cxxFlags // ""' cores.json` && \
	preinclude=`jq -r '."$*".preinclude // ""' cores.json` && \
	preinclude_files=`jq -r '."$*".preincludeFiles? // ["*"] | join(":")' cores.json` && \
	flag_args= && \
	if test -n "$$c_flags"; then flag_args="$$flag_args CFLAGS=$$c_flags"; cmake_c_flags="$$cmake_c_flags $$c_flags"; fi && \
	if test -n "$$cxx_flags"; then flag_args="$$flag_args CXXFLAGS=$$cxx_flags"; cmake_cxx_flags="$$cmake_cxx_flags $$cxx_flags"; fi && \
	cc='$(CC)' && \
	cxx='$(CXX)' && \
	ar='$(AR)' && \
	ranlib='$(RANLIB)' && \
	if test "`jq -r '."$*".useEmscripten // false' cores.json`" = true; then \
		cc=`command -v emcc`; \
		cxx=`command -v em++`; \
		ar=`command -v emar`; \
		ranlib=`command -v emranlib`; \
	fi && \
	if test "`jq -r '."$*" | if has("defineEmscripten") then .defineEmscripten else true end' cores.json`" != true; then \
		cmake_c_flags=`printf '%s\n' "$$cmake_c_flags" | sed 's/-D__EMSCRIPTEN__//g'`; \
		cmake_cxx_flags=`printf '%s\n' "$$cmake_cxx_flags" | sed 's/-D__EMSCRIPTEN__//g'`; \
	fi && \
	if test "`jq -r '."$*".stripEmccSettings // false' cores.json`" = true; then \
		cc="`pwd`/../scripts/wasi-filter-cc $$cc"; \
		cxx="`pwd`/../scripts/wasi-filter-cc $$cxx"; \
	fi && \
	if test -n "$$preinclude"; then \
		cc="sh `pwd`/../scripts/wasi-preinclude-cc $$preinclude $$preinclude_files $$cc"; \
		cxx="sh `pwd`/../scripts/wasi-preinclude-cc $$preinclude $$preinclude_files $$cxx"; \
	fi && \
	echo Building lib$*.a... && \
	if test "$$cmake" = true; then \
		builddir=`pwd`/../build/cores/$$name && \
		cmake -S $$name/$$makedir -B $$builddir \
			-DCMAKE_BUILD_TYPE=Release \
			-DCMAKE_SYSTEM_NAME=Generic \
			-DCMAKE_TRY_COMPILE_TARGET_TYPE=STATIC_LIBRARY \
			-DCMAKE_C_COMPILER="$(WASI_SDK)/bin/clang" \
			-DCMAKE_CXX_COMPILER="$(WASI_SDK)/bin/clang++" \
			-DCMAKE_AR="$(AR)" \
			-DCMAKE_RANLIB="$(RANLIB)" \
			-DCMAKE_C_FLAGS="$$cmake_c_flags" \
			-DCMAKE_CXX_FLAGS="$$cmake_cxx_flags" \
			-DBUILD_LIBRETRO=ON \
			-DLIBRETRO_STATIC=ON \
			-DSKIP_LIBRARY=ON \
			-DDISABLE_FRONTENDS=ON \
			-DBUILD_QT=OFF \
			-DBUILD_SDL=OFF \
			-DBUILD_GL=OFF \
			-DBUILD_GLES2=OFF \
			-DBUILD_GLES3=OFF \
			-DUSE_ZLIB=OFF \
			-DUSE_PNG=OFF \
			-DUSE_SQLITE3=OFF \
			-DUSE_LUA=OFF \
			-DUSE_ELF=OFF \
			-DUSE_EPOXY=OFF \
			$(QUIET) && \
		cmake --build $$builddir --target $*_libretro --parallel 8 $(QUIET) && \
		rm -rf `pwd`/$*-libs && \
		mkdir -p `pwd`/$*-libs && \
		test ! -d $$builddir/lib || find $$builddir/lib -name "*.a" -exec cp -f {} `pwd`/$*-libs/ \; && \
		find $$builddir -name "$*_libretro*.a" -print -quit | xargs -r cp -f -t `pwd` && \
		cp -f `pwd`/$*_libretro*.a $$target; \
	else \
		$(MAKE) -C $$name/$$makedir -f $$makefile TARGET=$$target \
			$(BUILD_JOBS) HAVE_OPENGL=0 STATIC_LINKING=1 AR="$$ar" RANLIB="$$ranlib" \
			platform=$$platform CC="$$cc" CXX="$$cxx" \
			$$flag_args $$extra_flags $(QUIET); \
	fi

clean-%:
	@rm -f `pwd`/lib$*.a
	@target=`pwd`/lib$*.a && \
	name=`jq -r '."$*".repository // "$*"' cores.json` && \
	makedir=`jq -r '."$*".directory // ""' cores.json` && \
	makefile=`jq -r '."$*".makefile // "Makefile"' cores.json` && \
	platform=`jq -r '."$*".platform // "emscripten"' cores.json` && \
	extra_flags=`jq -r '."$*".buildFlags[]? // empty' cores.json` && \
	c_flags=`jq -r '."$*".cFlags // ""' cores.json` && \
	cxx_flags=`jq -r '."$*".cxxFlags // ""' cores.json` && \
	preinclude=`jq -r '."$*".preinclude // ""' cores.json` && \
	preinclude_files=`jq -r '."$*".preincludeFiles? // ["*"] | join(":")' cores.json` && \
	flag_args= && \
	if test -n "$$c_flags"; then flag_args="$$flag_args CFLAGS=$$c_flags"; fi && \
	if test -n "$$cxx_flags"; then flag_args="$$flag_args CXXFLAGS=$$cxx_flags"; fi && \
	cc='$(CC)' && \
	cxx='$(CXX)' && \
	ar='$(AR)' && \
	ranlib='$(RANLIB)' && \
	if test "`jq -r '."$*".useEmscripten // false' cores.json`" = true; then \
		cc=`command -v emcc`; \
		cxx=`command -v em++`; \
		ar=`command -v emar`; \
		ranlib=`command -v emranlib`; \
	fi && \
	if test "`jq -r '."$*".stripEmccSettings // false' cores.json`" = true; then \
		cc="`pwd`/../scripts/wasi-filter-cc $$cc"; \
		cxx="`pwd`/../scripts/wasi-filter-cc $$cxx"; \
	fi && \
	if test -n "$$preinclude"; then \
		cc="sh `pwd`/../scripts/wasi-preinclude-cc $$preinclude $$preinclude_files $$cc"; \
		cxx="sh `pwd`/../scripts/wasi-preinclude-cc $$preinclude $$preinclude_files $$cxx"; \
	fi && \
	test ! -d $$name || \
	$(MAKE) -C $$name/$$makedir -f $$makefile clean TARGET=$$target \
		HAVE_OPENGL=0 STATIC_LINKING=1 AR="$$ar" RANLIB="$$ranlib" \
		platform=$$platform CC="$$cc" CXX="$$cxx" \
		$$flag_args $$extra_flags $(QUIET)

.PHONY: emsdk
