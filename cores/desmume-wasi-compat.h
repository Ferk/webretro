#pragma once

#if defined(__wasi__) || defined(__EMSCRIPTEN__)
#include <arpa/inet.h>
#include <sys/select.h>
#include <sys/socket.h>
#include <unistd.h>

#ifdef __cplusplus
#include <functional>
#endif

#ifndef __HAIKU__
#define __HAIKU__ 1
#endif

#ifndef SO_REUSEADDR
#define SO_REUSEADDR 0
#endif
#ifndef SO_BROADCAST
#define SO_BROADCAST 0
#endif

#ifdef __cplusplus
#define socket(...) (-1)
#define setsockopt(...) (-1)
#define bind(...) (-1)
#define sendto(...) (-1)
#define recvfrom(...) (-1)
#endif
#endif
