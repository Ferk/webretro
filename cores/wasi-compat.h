#pragma once

#if defined(__wasi__)
#ifndef L_tmpnam
#define L_tmpnam 32
#endif

#ifndef LUA_USE_LONGJMP
#define LUA_USE_LONGJMP
#endif
#endif
