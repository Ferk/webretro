#pragma once

#include <stdbool.h>
#include <stdint.h>

#include "libretro.h"

bool GamejinHardwareConfigure(bool enabled);
bool GamejinHardwareActive(void);
void GamejinHardwareReset(void);
void GamejinHardwareDestroy(void);
void GamejinHardwarePresent(void);
uintptr_t GamejinHardwareFramebuffer(void);
retro_proc_address_t GamejinHardwareGetProcAddress(const char *name);
