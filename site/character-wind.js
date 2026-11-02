(() => {
  const image = document.querySelector('.character-art');
  const enabled = matchMedia('(min-width: 601px) and (prefers-reduced-motion: no-preference)');
  const canvas = document.createElement('canvas');
  canvas.className = 'character-art character-mesh';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.hidden = true;
  image.closest('picture').after(canvas);
  const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: true });
  if (!gl) return;

  function shader(type, source) {
    const result = gl.createShader(type);
    gl.shaderSource(result, source);
    gl.compileShader(result);
    if (!gl.getShaderParameter(result, gl.COMPILE_STATUS)) {
      gl.deleteShader(result);
      throw new Error('Character shader compilation failed');
    }
    return result;
  }

  let program;
  try {
    program = gl.createProgram();
    gl.attachShader(program, shader(gl.VERTEX_SHADER, `
      attribute vec2 position;
      uniform float time;
      varying vec2 uv;
      float region(vec2 p, vec2 center, vec2 radius) {
        vec2 d = (p - center) / radius;
        return pow(max(0.0, 1.0 - dot(d, d)), 2.0);
      }
      void main() {
        uv = position;
        vec2 p = position;
        // Coordinates follow the source image, with y measured from the top.
        // Separate side locks keep the face and antlers anchored.
        float hair = region(p, vec2(0.397, 0.139), vec2(0.065, 0.055))
                   + region(p, vec2(0.535, 0.140), vec2(0.055, 0.050));
        float skirt = region(p, vec2(0.475, 0.565), vec2(0.185, 0.110));
        p.x += hair * 0.0035 * sin(time * 1.15 + p.y * 24.0)
             + skirt * 0.0028 * sin(time * 0.85 + p.x * 12.0);
        p.y += skirt * 0.0008 * sin(time * 0.85 + p.x * 15.0);
        gl_Position = vec4(p.x * 2.0 - 1.0, 1.0 - p.y * 2.0, 0.0, 1.0);
      }
    `));
    gl.attachShader(program, shader(gl.FRAGMENT_SHADER, `
      precision mediump float;
      uniform sampler2D art;
      varying vec2 uv;
      void main() { gl_FragColor = texture2D(art, uv); }
    `));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('Character shader linking failed');
  } catch {
    return; // Keep the original image if WebGL is unavailable.
  }

  gl.useProgram(program);
  const vertices = [];
  const columns = 80;
  const rows = 120;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < columns; x++) {
      const left = x / columns, right = (x + 1) / columns;
      const top = y / rows, bottom = (y + 1) / rows;
      vertices.push(left, top, right, top, left, bottom, left, bottom, right, top, right, bottom);
    }
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, 'position');
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  const time = gl.getUniformLocation(program, 'time');
  gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);

  let ready = false;
  let frame = 0;
  let elapsed = 0;
  let previous = 0;
  function draw(now) {
    elapsed += Math.min((now - previous) / 1000, 0.05);
    previous = now;
    gl.uniform1f(time, elapsed);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, vertices.length / 2);
    frame = requestAnimationFrame(draw);
  }
  function sync() {
    cancelAnimationFrame(frame);
    const active = ready && enabled.matches && !document.hidden;
    canvas.hidden = !active;
    image.hidden = active;
    if (active) {
      previous = performance.now();
      frame = requestAnimationFrame(draw);
    }
  }
  function upload() {
    if (ready || !enabled.matches || image.naturalWidth < 2) return;
    try {
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      if (gl.getError() !== gl.NO_ERROR) return;
      ready = true;
      sync();
    } catch { /* The original image remains visible if texture upload fails. */ }
  }
  image.addEventListener('load', upload);
  enabled.addEventListener('change', () => { upload(); sync(); });
  document.addEventListener('visibilitychange', sync);
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    ready = false;
    sync();
  });
  upload();
})();
