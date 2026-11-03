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
      uniform vec2 cursor;
      uniform vec2 gust;
      uniform float aspect;
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
        // Local masks let loose fabric move while its attachment stays still.
        float ribbons = region(p, vec2(0.347, 0.690), vec2(0.031, 0.090))
                      + region(p, vec2(0.629, 0.654), vec2(0.025, 0.075));
        float bows = region(p, vec2(0.348, 0.844), vec2(0.030, 0.046))
                   + region(p, vec2(0.423, 0.862), vec2(0.024, 0.040))
                   + region(p, vec2(0.551, 0.858), vec2(0.028, 0.039))
                   + region(p, vec2(0.638, 0.860), vec2(0.026, 0.041));
        float ruffles = region(p, vec2(0.367, 0.316), vec2(0.061, 0.025))
                      + region(p, vec2(0.607, 0.266), vec2(0.052, 0.021))
                      + region(p, vec2(0.331, 0.520), vec2(0.044, 0.023))
                      + region(p, vec2(0.647, 0.424), vec2(0.033, 0.023));
        // Broader falloff keeps the small fabric edges visibly moving at page scale.
        ribbons = sqrt(ribbons);
        bows = sqrt(bows);
        ruffles = sqrt(ruffles);
        vec2 fabric = vec2(
          ribbons * 0.0100 * sin(time * 0.85 + position.y * 18.0)
            + bows * 0.0070 * sin(time * 1.05 + position.x * 16.0)
            + ruffles * 0.0060 * sin(time * 1.15 + position.x * 14.0),
          ribbons * 0.0018 * sin(time * 0.85 + position.y * 21.0)
            + bows * 0.0025 * sin(time * 1.05 + position.x * 19.0)
            + ruffles * 0.0028 * sin(time * 1.15 + position.x * 17.0)
        );
        p.x += hair * 0.0035 * sin(time * 1.15 + p.y * 24.0)
             + skirt * 0.0028 * sin(time * 0.85 + p.x * 12.0);
        p.y += skirt * 0.0008 * sin(time * 0.85 + p.x * 15.0);
        p += fabric;
        vec2 distanceFromCursor = (position - cursor) * vec2(aspect, 1.0);
        float nearby = 1.0 - smoothstep(0.0, 0.16, length(distanceFromCursor));
        float loose = min(1.0, hair + skirt + ribbons + bows + ruffles);
        p += gust * nearby * loose;
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
  const cursor = gl.getUniformLocation(program, 'cursor');
  const gust = gl.getUniformLocation(program, 'gust');
  const aspect = gl.getUniformLocation(program, 'aspect');
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
  let pointer = null;
  const wind = { x: 0, y: 0, targetX: 0, targetY: 0, u: -1, v: -1 };
  function resetPointer() {
    pointer = null;
    wind.targetX = wind.targetY = 0;
  }
  // Listen outside the canvas: the decorative art deliberately ignores hit testing.
  window.addEventListener('pointermove', (event) => {
    if (!ready || canvas.hidden || event.pointerType === 'touch') return;
    const rect = canvas.getBoundingClientRect();
    const scale = Math.min(rect.width / canvas.width, rect.height / canvas.height);
    const width = canvas.width * scale;
    const height = canvas.height * scale;
    const u = (event.clientX - rect.left - (rect.width - width) / 2) / width;
    const v = (event.clientY - rect.top - (rect.height - height) / 2) / height;
    if (u < 0 || u > 1 || v < 0 || v > 1) { resetPointer(); return; }
    wind.u = u;
    wind.v = v;
    if (pointer) {
      const seconds = Math.max((event.timeStamp - pointer.time) / 1000, 0.008);
      wind.targetX = Math.max(-0.018, Math.min(0.018, (u - pointer.u) / seconds * 0.018));
      wind.targetY = Math.max(-0.008, Math.min(0.008, (v - pointer.v) / seconds * 0.012));
    }
    pointer = { u, v, time: event.timeStamp };
  }, { passive: true });
  window.addEventListener('pointerout', (event) => { if (!event.relatedTarget) resetPointer(); });
  window.addEventListener('pointercancel', resetPointer);
  window.addEventListener('blur', resetPointer);
  function draw(now) {
    const delta = Math.min((now - previous) / 1000, 0.05);
    elapsed += delta;
    previous = now;
    const blend = 1 - Math.exp(-delta * 10);
    wind.x += (wind.targetX - wind.x) * blend;
    wind.y += (wind.targetY - wind.y) * blend;
    wind.targetX *= Math.exp(-delta * 6);
    wind.targetY *= Math.exp(-delta * 6);
    gl.uniform1f(time, elapsed);
    gl.uniform2f(cursor, wind.u, wind.v);
    gl.uniform2f(gust, wind.x, wind.y);
    gl.uniform1f(aspect, canvas.width / canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, vertices.length / 2);
    frame = requestAnimationFrame(draw);
  }
  function sync() {
    cancelAnimationFrame(frame);
    resetPointer();
    wind.x = wind.y = 0;
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
