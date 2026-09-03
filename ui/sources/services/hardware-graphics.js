const IMPORTS = [
	'web_gl_active_texture', 'web_gl_attach_shader', 'web_gl_bind_buffer', 'web_gl_bind_framebuffer',
	'web_gl_bind_texture', 'web_gl_bind_vertex_array', 'web_gl_blend_equation', 'web_gl_blend_func',
	'web_gl_buffer_data', 'web_gl_buffer_sub_data', 'web_gl_compile_shader', 'web_gl_create_program',
	'web_gl_create_shader', 'web_gl_delete_buffers', 'web_gl_delete_program', 'web_gl_delete_shader',
	'web_gl_delete_textures', 'web_gl_delete_vertex_arrays', 'web_gl_detach_shader', 'web_gl_draw_elements',
	'web_gl_enable', 'web_gl_enable_vertex_attrib_array', 'web_gl_gen_buffers', 'web_gl_gen_textures',
	'web_gl_flush', 'web_gl_gen_vertex_arrays', 'web_gl_get_attrib_location', 'web_gl_get_error', 'web_gl_get_program_iv',
	'web_gl_get_shader_info_log', 'web_gl_get_shader_iv', 'web_gl_get_uniform_location', 'web_gl_link_program',
	'web_gl_shader_source', 'web_gl_tex_image_2d', 'web_gl_tex_parameter_f', 'web_gl_tex_parameter_i',
	'web_gl_uniform_1i', 'web_gl_uniform_4f', 'web_gl_use_program', 'web_gl_vertex_attrib_pointer', 'web_gl_viewport',
];

/** @returns {Record<string, (...args: number[]) => number>} */
export const hardwareImports = () => Object.fromEntries(IMPORTS.map(name => [name, () => 0]));

/**
 * WebGL object tables and the GLES2 surface imported by hardware libretro
 * cores. It intentionally owns an OffscreenCanvas in the core worker.
 */
export default class HardwareGraphics {
	#canvas;
	#gl;
	#vao;
	#memory;
	#buffers = new Map();
	#textures = new Map();
	#shaders = new Map();
	#programs = new Map();
	#arrays = new Map();
	#locations = new Map();
	#next = 1;

	constructor(canvas, memory) {
		this.#canvas = canvas;
		this.#gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false });
		if (!this.#gl)
			throw new Error('WebGL is required by this hardware-rendered core.');
		this.#vao = this.#gl.getExtension('OES_vertex_array_object');
		if (!this.#vao)
			throw new Error('This hardware-rendered core requires the WebGL OES_vertex_array_object extension.');
		this.#memory = memory;
	}

	#id(table, object) {
		const id = this.#next++;
		table.set(id, object);
		return id;
	}

	#u8(pointer, size) { return new Uint8Array(this.#memory.buffer, pointer, size).slice(); }
	#u32(pointer, count) { return new Uint32Array(this.#memory.buffer, pointer, count); }
	#i32(pointer) { return new Int32Array(this.#memory.buffer, pointer, 1); }
	#string(pointer, length = -1) {
		const bytes = new Uint8Array(this.#memory.buffer, pointer);
		if (length < 0) length = bytes.indexOf(0);
		return new TextDecoder().decode(bytes.slice(0, Math.max(0, length)));
	}
	#location(location) { return this.#locations.get(location) ?? null; }

	web_gl_active_texture = texture => this.#gl.activeTexture(texture);
	web_gl_attach_shader = (program, shader) => this.#gl.attachShader(this.#programs.get(program), this.#shaders.get(shader));
	web_gl_bind_buffer = (target, buffer) => this.#gl.bindBuffer(target, this.#buffers.get(buffer) ?? null);
	web_gl_bind_framebuffer = (target, framebuffer) => this.#gl.bindFramebuffer(target, framebuffer ? null : null);
	web_gl_bind_texture = (target, texture) => this.#gl.bindTexture(target, this.#textures.get(texture) ?? null);
	web_gl_bind_vertex_array = array => this.#vao.bindVertexArrayOES(this.#arrays.get(array) ?? null);
	web_gl_blend_equation = mode => this.#gl.blendEquation(mode);
	web_gl_blend_func = (source, destination) => this.#gl.blendFunc(source, destination);
	web_gl_buffer_data = (target, size, data, usage) => this.#gl.bufferData(target, data ? this.#u8(data, size) : size, usage);
	web_gl_buffer_sub_data = (target, offset, size, data) => this.#gl.bufferSubData(target, offset, this.#u8(data, size));
	web_gl_compile_shader = shader => this.#gl.compileShader(this.#shaders.get(shader));
	web_gl_create_program = () => this.#id(this.#programs, this.#gl.createProgram());
	web_gl_create_shader = type => this.#id(this.#shaders, this.#gl.createShader(type));
	web_gl_delete_buffers = (count, pointer) => this.#delete(this.#buffers, count, pointer, object => this.#gl.deleteBuffer(object));
	web_gl_delete_program = program => { this.#gl.deleteProgram(this.#programs.get(program)); this.#programs.delete(program); };
	web_gl_delete_shader = shader => { this.#gl.deleteShader(this.#shaders.get(shader)); this.#shaders.delete(shader); };
	web_gl_delete_textures = (count, pointer) => this.#delete(this.#textures, count, pointer, object => this.#gl.deleteTexture(object));
	web_gl_delete_vertex_arrays = (count, pointer) => this.#delete(this.#arrays, count, pointer, object => this.#vao.deleteVertexArrayOES(object));
	web_gl_detach_shader = (program, shader) => this.#gl.detachShader(this.#programs.get(program), this.#shaders.get(shader));
	web_gl_draw_elements = (mode, count, type, offset) => this.#gl.drawElements(mode, count, type, offset);
	web_gl_enable = capability => { if (capability != 0x0de1) this.#gl.enable(capability); };
	web_gl_enable_vertex_attrib_array = index => this.#gl.enableVertexAttribArray(index);
	web_gl_flush = () => this.#gl.flush();
	web_gl_gen_buffers = (count, pointer) => this.#generate(this.#buffers, count, pointer, () => this.#gl.createBuffer());
	web_gl_gen_textures = (count, pointer) => this.#generate(this.#textures, count, pointer, () => this.#gl.createTexture());
	web_gl_gen_vertex_arrays = (count, pointer) => this.#generate(this.#arrays, count, pointer, () => this.#vao.createVertexArrayOES());
	web_gl_get_attrib_location = (program, name) => this.#gl.getAttribLocation(this.#programs.get(program), this.#string(name));
	web_gl_get_error = () => this.#gl.getError();
	web_gl_get_program_iv = (program, pname, pointer) => this.#i32(pointer)[0] = this.#gl.getProgramParameter(this.#programs.get(program), pname) || 0;
	web_gl_get_shader_iv = (shader, pname, pointer) => this.#i32(pointer)[0] = this.#gl.getShaderParameter(this.#shaders.get(shader), pname) || 0;
	web_gl_get_uniform_location = (program, name) => {
		const location = this.#gl.getUniformLocation(this.#programs.get(program), this.#string(name));
		return location == null ? -1 : this.#id(this.#locations, location);
	};
	web_gl_link_program = program => this.#gl.linkProgram(this.#programs.get(program));
	web_gl_shader_source = (shader, count, strings, lengths) => {
		const pointers = this.#u32(strings, count);
		const sizes = lengths ? new Int32Array(this.#memory.buffer, lengths, count) : null;
		this.#gl.shaderSource(this.#shaders.get(shader), [...pointers].map((pointer, i) => this.#string(pointer, sizes?.[i] ?? -1)).join(''));
	};
	web_gl_tex_image_2d = (target, level, internalFormat, width, height, border, format, type, pixels) =>
		this.#gl.texImage2D(target, level, internalFormat, width, height, border, format, type, pixels ? this.#u8(pixels, width * height * 4) : null);
	web_gl_tex_parameter_f = (target, pname, value) => this.#gl.texParameterf(target, pname, value);
	web_gl_tex_parameter_i = (target, pname, value) => this.#gl.texParameteri(target, pname, value);
	web_gl_uniform_1i = (location, value) => this.#gl.uniform1i(this.#location(location), value);
	web_gl_uniform_4f = (location, x, y, z, w) => this.#gl.uniform4f(this.#location(location), x, y, z, w);
	web_gl_use_program = program => this.#gl.useProgram(this.#programs.get(program));
	web_gl_vertex_attrib_pointer = (index, size, type, normalized, stride, offset) => this.#gl.vertexAttribPointer(index, size, type, normalized, stride, offset);
	web_gl_viewport = (x, y, width, height) => {
		if (this.#canvas.width != width || this.#canvas.height != height) {
			this.#canvas.width = width;
			this.#canvas.height = height;
		}
		this.#gl.viewport(x, y, width, height);
	};

	web_gl_get_shader_info_log = (shader, size, length, log) => {
		const bytes = new TextEncoder().encode(this.#gl.getShaderInfoLog(this.#shaders.get(shader)) ?? '').slice(0, Math.max(0, size - 1));
		new Uint8Array(this.#memory.buffer, log, size).fill(0).set(bytes);
		if (length) this.#i32(length)[0] = bytes.length;
	};

	#generate(table, count, pointer, factory) {
		const ids = this.#u32(pointer, count);
		for (let i = 0; i < count; i++) ids[i] = this.#id(table, factory());
	}

	#delete(table, count, pointer, destroy) {
		for (const id of this.#u32(pointer, count)) {
			const object = table.get(id);
			if (object) destroy(object);
			table.delete(id);
		}
	}
}
