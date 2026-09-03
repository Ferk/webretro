#include "hardware.h"

#include <stdint.h>
#include <string.h>

#include "libretro.h"

#define IMPORT(name) __attribute__((import_module("env"), import_name(#name))) name

static bool enabled;

void IMPORT(web_gl_active_texture)(uint32_t texture);
void IMPORT(web_gl_attach_shader)(uint32_t program, uint32_t shader);
void IMPORT(web_gl_bind_buffer)(uint32_t target, uint32_t buffer);
void IMPORT(web_gl_bind_framebuffer)(uint32_t target, uint32_t framebuffer);
void IMPORT(web_gl_bind_texture)(uint32_t target, uint32_t texture);
void IMPORT(web_gl_bind_vertex_array)(uint32_t array);
void IMPORT(web_gl_blend_equation)(uint32_t mode);
void IMPORT(web_gl_blend_func)(uint32_t source, uint32_t destination);
void IMPORT(web_gl_buffer_data)(uint32_t target, uint32_t size, const void *data, uint32_t usage);
void IMPORT(web_gl_buffer_sub_data)(uint32_t target, uint32_t offset, uint32_t size, const void *data);
void IMPORT(web_gl_compile_shader)(uint32_t shader);
uint32_t IMPORT(web_gl_create_program)(void);
uint32_t IMPORT(web_gl_create_shader)(uint32_t type);
void IMPORT(web_gl_delete_buffers)(uint32_t count, const uint32_t *buffers);
void IMPORT(web_gl_delete_program)(uint32_t program);
void IMPORT(web_gl_delete_shader)(uint32_t shader);
void IMPORT(web_gl_delete_textures)(uint32_t count, const uint32_t *textures);
void IMPORT(web_gl_delete_vertex_arrays)(uint32_t count, const uint32_t *arrays);
void IMPORT(web_gl_detach_shader)(uint32_t program, uint32_t shader);
void IMPORT(web_gl_draw_elements)(uint32_t mode, uint32_t count, uint32_t type, uint32_t offset);
void IMPORT(web_gl_enable)(uint32_t capability);
void IMPORT(web_gl_enable_vertex_attrib_array)(uint32_t index);
void IMPORT(web_gl_flush)(void);
void IMPORT(web_gl_gen_buffers)(uint32_t count, uint32_t *buffers);
void IMPORT(web_gl_gen_textures)(uint32_t count, uint32_t *textures);
void IMPORT(web_gl_gen_vertex_arrays)(uint32_t count, uint32_t *arrays);
int32_t IMPORT(web_gl_get_attrib_location)(uint32_t program, const char *name);
uint32_t IMPORT(web_gl_get_error)(void);
void IMPORT(web_gl_get_program_iv)(uint32_t program, uint32_t pname, int32_t *value);
void IMPORT(web_gl_get_shader_info_log)(uint32_t shader, uint32_t size, int32_t *length, char *log);
void IMPORT(web_gl_get_shader_iv)(uint32_t shader, uint32_t pname, int32_t *value);
int32_t IMPORT(web_gl_get_uniform_location)(uint32_t program, const char *name);
void IMPORT(web_gl_link_program)(uint32_t program);
void IMPORT(web_gl_shader_source)(uint32_t shader, uint32_t count, const char *const *strings, const int32_t *lengths);
void IMPORT(web_gl_tex_image_2d)(uint32_t target, int32_t level, int32_t internal_format, uint32_t width, uint32_t height, int32_t border, uint32_t format, uint32_t type, const void *pixels);
void IMPORT(web_gl_tex_parameter_f)(uint32_t target, uint32_t pname, float value);
void IMPORT(web_gl_tex_parameter_i)(uint32_t target, uint32_t pname, int32_t value);
void IMPORT(web_gl_uniform_1i)(int32_t location, int32_t value);
void IMPORT(web_gl_uniform_4f)(int32_t location, float x, float y, float z, float w);
void IMPORT(web_gl_use_program)(uint32_t program);
void IMPORT(web_gl_vertex_attrib_pointer)(uint32_t index, int32_t size, uint32_t type, bool normalized, uint32_t stride, uint32_t offset);
void IMPORT(web_gl_viewport)(int32_t x, int32_t y, uint32_t width, uint32_t height);

bool GamejinHardwareConfigure(bool value)
{
	enabled = value;
	return enabled;
}

bool GamejinHardwareActive(void)
{
	return enabled;
}

void GamejinHardwareReset(void) {}
void GamejinHardwareDestroy(void) {}
void GamejinHardwarePresent(void)
{
	if (enabled)
		web_gl_flush();
}
uintptr_t GamejinHardwareFramebuffer(void) { return 0; }

static const unsigned char *gl_get_string(uint32_t name)
{
	switch (name) {
		case 0x1F00: return (const unsigned char *) "Gamejin";
		case 0x1F01: return (const unsigned char *) "Gamejin WebGL2";
		case 0x1F02: return (const unsigned char *) "OpenGL ES 2.0 WebGL 1.0";
		case 0x8B8C: return (const unsigned char *) "OpenGL ES GLSL ES 1.00";
		default: return NULL;
	}
}

#define PROC(name) if (!strcmp(symbol, "gl" #name)) return (retro_proc_address_t) gl##name

void glActiveTexture(uint32_t); void glAttachShader(uint32_t, uint32_t); void glBindBuffer(uint32_t, uint32_t); void glBindFramebuffer(uint32_t, uint32_t);
void glBindTexture(uint32_t, uint32_t); void glBindVertexArrayOES(uint32_t); void glBlendEquation(uint32_t); void glBlendFunc(uint32_t, uint32_t);
void glBufferData(uint32_t, uint32_t, const void *, uint32_t); void glBufferSubData(uint32_t, uint32_t, uint32_t, const void *); void glCompileShader(uint32_t);
uint32_t glCreateProgram(void); uint32_t glCreateShader(uint32_t); void glDeleteBuffers(uint32_t, const uint32_t *); void glDeleteProgram(uint32_t);
void glDeleteShader(uint32_t); void glDeleteTextures(uint32_t, const uint32_t *); void glDeleteVertexArraysOES(uint32_t, const uint32_t *); void glDetachShader(uint32_t, uint32_t);
void glDrawElements(uint32_t, uint32_t, uint32_t, const void *); void glEnable(uint32_t); void glEnableVertexAttribArray(uint32_t); void glGenBuffers(uint32_t, uint32_t *);
void glGenTextures(uint32_t, uint32_t *); void glGenVertexArraysOES(uint32_t, uint32_t *); int32_t glGetAttribLocation(uint32_t, const char *); uint32_t glGetError(void);
void glGetProgramiv(uint32_t, uint32_t, int32_t *); void glGetShaderInfoLog(uint32_t, uint32_t, int32_t *, char *); void glGetShaderiv(uint32_t, uint32_t, int32_t *);
const unsigned char *glGetString(uint32_t); int32_t glGetUniformLocation(uint32_t, const char *); void glLinkProgram(uint32_t); void glShaderSource(uint32_t, uint32_t, const char *const *, const int32_t *);
void glTexImage2D(uint32_t, int32_t, int32_t, uint32_t, uint32_t, int32_t, uint32_t, uint32_t, const void *); void glTexParameterf(uint32_t, uint32_t, float); void glTexParameteri(uint32_t, uint32_t, int32_t);
void glUniform1i(int32_t, int32_t); void glUniform4f(int32_t, float, float, float, float); void glUseProgram(uint32_t); void glVertexAttribPointer(uint32_t, int32_t, uint32_t, bool, uint32_t, const void *); void glViewport(int32_t, int32_t, uint32_t, uint32_t);

retro_proc_address_t GamejinHardwareGetProcAddress(const char *symbol)
{
	if (!enabled || !symbol)
		return NULL;

	PROC(ActiveTexture); PROC(AttachShader); PROC(BindBuffer); PROC(BindFramebuffer);
	PROC(BindTexture); PROC(BindVertexArrayOES); PROC(BlendEquation); PROC(BlendFunc);
	PROC(BufferData); PROC(BufferSubData); PROC(CompileShader); PROC(CreateProgram);
	PROC(CreateShader); PROC(DeleteBuffers); PROC(DeleteProgram); PROC(DeleteShader);
	PROC(DeleteTextures); PROC(DeleteVertexArraysOES); PROC(DetachShader); PROC(DrawElements);
	PROC(Enable); PROC(EnableVertexAttribArray); PROC(GenBuffers); PROC(GenTextures);
	PROC(GenVertexArraysOES); PROC(GetAttribLocation); PROC(GetError); PROC(GetProgramiv);
	PROC(GetShaderInfoLog); PROC(GetShaderiv); PROC(GetString); PROC(GetUniformLocation);
	PROC(LinkProgram); PROC(ShaderSource); PROC(TexImage2D); PROC(TexParameterf);
	PROC(TexParameteri); PROC(Uniform1i); PROC(Uniform4f); PROC(UseProgram);
	PROC(VertexAttribPointer); PROC(Viewport);

	return NULL;
}

void glActiveTexture(uint32_t texture) { web_gl_active_texture(texture); }
void glAttachShader(uint32_t program, uint32_t shader) { web_gl_attach_shader(program, shader); }
void glBindBuffer(uint32_t target, uint32_t buffer) { web_gl_bind_buffer(target, buffer); }
void glBindFramebuffer(uint32_t target, uint32_t framebuffer) { web_gl_bind_framebuffer(target, framebuffer); }
void glBindTexture(uint32_t target, uint32_t texture) { web_gl_bind_texture(target, texture); }
void glBindVertexArrayOES(uint32_t array) { web_gl_bind_vertex_array(array); }
void glBlendEquation(uint32_t mode) { web_gl_blend_equation(mode); }
void glBlendFunc(uint32_t source, uint32_t destination) { web_gl_blend_func(source, destination); }
void glBufferData(uint32_t target, uint32_t size, const void *data, uint32_t usage) { web_gl_buffer_data(target, size, data, usage); }
void glBufferSubData(uint32_t target, uint32_t offset, uint32_t size, const void *data) { web_gl_buffer_sub_data(target, offset, size, data); }
void glCompileShader(uint32_t shader) { web_gl_compile_shader(shader); }
uint32_t glCreateProgram(void) { return web_gl_create_program(); }
uint32_t glCreateShader(uint32_t type) { return web_gl_create_shader(type); }
void glDeleteBuffers(uint32_t count, const uint32_t *buffers) { web_gl_delete_buffers(count, buffers); }
void glDeleteProgram(uint32_t program) { web_gl_delete_program(program); }
void glDeleteShader(uint32_t shader) { web_gl_delete_shader(shader); }
void glDeleteTextures(uint32_t count, const uint32_t *textures) { web_gl_delete_textures(count, textures); }
void glDeleteVertexArraysOES(uint32_t count, const uint32_t *arrays) { web_gl_delete_vertex_arrays(count, arrays); }
void glDetachShader(uint32_t program, uint32_t shader) { web_gl_detach_shader(program, shader); }
void glDrawElements(uint32_t mode, uint32_t count, uint32_t type, const void *offset) { web_gl_draw_elements(mode, count, type, (uintptr_t) offset); }
void glEnable(uint32_t capability) { web_gl_enable(capability); }
void glEnableVertexAttribArray(uint32_t index) { web_gl_enable_vertex_attrib_array(index); }
void glGenBuffers(uint32_t count, uint32_t *buffers) { web_gl_gen_buffers(count, buffers); }
void glGenTextures(uint32_t count, uint32_t *textures) { web_gl_gen_textures(count, textures); }
void glGenVertexArraysOES(uint32_t count, uint32_t *arrays) { web_gl_gen_vertex_arrays(count, arrays); }
int32_t glGetAttribLocation(uint32_t program, const char *name) { return web_gl_get_attrib_location(program, name); }
uint32_t glGetError(void) { return web_gl_get_error(); }
void glGetProgramiv(uint32_t program, uint32_t pname, int32_t *value) { web_gl_get_program_iv(program, pname, value); }
void glGetShaderInfoLog(uint32_t shader, uint32_t size, int32_t *length, char *log) { web_gl_get_shader_info_log(shader, size, length, log); }
void glGetShaderiv(uint32_t shader, uint32_t pname, int32_t *value) { web_gl_get_shader_iv(shader, pname, value); }
const unsigned char *glGetString(uint32_t name) { return gl_get_string(name); }
int32_t glGetUniformLocation(uint32_t program, const char *name) { return web_gl_get_uniform_location(program, name); }
void glLinkProgram(uint32_t program) { web_gl_link_program(program); }
void glShaderSource(uint32_t shader, uint32_t count, const char *const *strings, const int32_t *lengths) { web_gl_shader_source(shader, count, strings, lengths); }
void glTexImage2D(uint32_t target, int32_t level, int32_t internal_format, uint32_t width, uint32_t height, int32_t border, uint32_t format, uint32_t type, const void *pixels) { web_gl_tex_image_2d(target, level, internal_format, width, height, border, format, type, pixels); }
void glTexParameterf(uint32_t target, uint32_t pname, float value) { web_gl_tex_parameter_f(target, pname, value); }
void glTexParameteri(uint32_t target, uint32_t pname, int32_t value) { web_gl_tex_parameter_i(target, pname, value); }
void glUniform1i(int32_t location, int32_t value) { web_gl_uniform_1i(location, value); }
void glUniform4f(int32_t location, float x, float y, float z, float w) { web_gl_uniform_4f(location, x, y, z, w); }
void glUseProgram(uint32_t program) { web_gl_use_program(program); }
void glVertexAttribPointer(uint32_t index, int32_t size, uint32_t type, bool normalized, uint32_t stride, const void *offset) { web_gl_vertex_attrib_pointer(index, size, type, normalized, stride, (uintptr_t) offset); }
void glViewport(int32_t x, int32_t y, uint32_t width, uint32_t height) { web_gl_viewport(x, y, width, height); }
