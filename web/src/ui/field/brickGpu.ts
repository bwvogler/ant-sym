import { CHUNK } from "../../colony/index.ts";
import type { ChunkCanvas } from "./ground.ts";

const VERTEX = `#version 300 es
layout(location = 0) in vec4 rect;
uniform vec2 viewport;
uniform int firstRow;
out vec2 uv;
void main() {
  vec2 corner = vec2(float(gl_VertexID & 1), float(gl_VertexID >> 1));
  vec2 point = rect.xy + corner * rect.zw;
  gl_Position = vec4(point / viewport * vec2(2., -2.) + vec2(-1., 1.), 0., 1.);
  uv = vec2(corner.x, (float(firstRow + gl_InstanceID) + corner.y) / ${CHUNK}.);
}`;

const FRAGMENT = `#version 300 es
precision highp float;
uniform sampler2D tile;
in vec2 uv;
out vec4 color;
void main() {
  color = texture(tile, uv);
}`;

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
  gl.deleteShader(shader);
  return null;
}

function link(gl: WebGL2RenderingContext): WebGLProgram | null {
  const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
  const program = vertex && fragment ? gl.createProgram() : null;
  if (program && vertex && fragment) {
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
  }
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (program && gl.getProgramParameter(program, gl.LINK_STATUS)) return program;
  gl.deleteProgram(program);
  return null;
}

/** Rasterize the same pixel-aligned ground rows, one instanced draw per chunk. The other map layers still use the main canvas. */
export class BrickGpu {
  readonly rects = new Float32Array(CHUNK * 4);
  private readonly textures = new Map<ChunkCanvas, { texture: WebGLTexture; version: number }>();
  private readonly viewport: WebGLUniformLocation | null;
  private readonly row: WebGLUniformLocation | null;

  static create(canvas: HTMLCanvasElement): BrickGpu | null {
    const gl = canvas.getContext("webgl2", {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
    });
    if (!gl) return null;
    const program = link(gl);
    const buffer = program ? gl.createBuffer() : null;
    if (program && buffer) return new BrickGpu(canvas, gl, program, buffer);
    gl.deleteProgram(program);
    return null;
  }

  private readonly canvas: HTMLCanvasElement;
  private readonly gl: WebGL2RenderingContext;
  private readonly program: WebGLProgram;
  private readonly buffer: WebGLBuffer;

  private constructor(canvas: HTMLCanvasElement, gl: WebGL2RenderingContext, program: WebGLProgram, buffer: WebGLBuffer) {
    this.canvas = canvas;
    this.gl = gl;
    this.program = program;
    this.buffer = buffer;
    this.viewport = gl.getUniformLocation(program, "viewport");
    this.row = gl.getUniformLocation(program, "firstRow");
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.rects.byteLength, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(0, 1);
  }

  begin(w: number, h: number): boolean {
    const { canvas, gl } = this;
    if (gl.isContextLost()) return false;
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    if (gl.drawingBufferWidth !== w || gl.drawingBufferHeight !== h) return false;
    gl.viewport(0, 0, w, h);
    gl.uniform2f(this.viewport, w, h);
    gl.clear(gl.COLOR_BUFFER_BIT);
    return true;
  }

  draw(chunk: ChunkCanvas, firstRow: number, count: number): boolean {
    if (count <= 0) return true;
    const { gl } = this;
    let tile = this.textures.get(chunk);
    if (!tile) {
      const texture = gl.createTexture();
      if (!texture) return false;
      tile = { texture, version: -1 };
      this.textures.set(chunk, tile);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, CHUNK, CHUNK);
    } else gl.bindTexture(gl.TEXTURE_2D, tile.texture);
    if (tile.version !== chunk.version) {
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, CHUNK, CHUNK, gl.RGBA, gl.UNSIGNED_BYTE, chunk.img.data);
      tile.version = chunk.version;
    }
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.rects, 0, count * 4);
    gl.uniform1i(this.row, firstRow);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
    return true;
  }

  composite(ctx: CanvasRenderingContext2D): boolean {
    if (this.gl.isContextLost()) return false;
    ctx.drawImage(this.canvas, 0, 0);
    return true;
  }

  release(chunk: ChunkCanvas): void {
    const tile = this.textures.get(chunk);
    if (!tile) return;
    this.gl.deleteTexture(tile.texture);
    this.textures.delete(chunk);
  }

  dispose(): void {
    for (const chunk of this.textures.keys()) this.release(chunk);
    this.gl.deleteBuffer(this.buffer);
    this.gl.deleteProgram(this.program);
    this.gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
}
