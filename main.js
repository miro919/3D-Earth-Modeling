
// WebGL 초기화
const canvas = document.getElementById("glCanvas");
const gl = canvas.getContext("webgl");
if (!gl) {throw new Error("WebGL을 지원하지 않습니다.");}

gl.viewport(0, 0, canvas.width, canvas.height);
gl.clearColor(0.0, 0.0, 0.0, 1.0);
gl.enable(gl.DEPTH_TEST);


// Vertex Shader
const vertexSource = `
    attribute vec3 aPosition;
    attribute vec2 aUV;

    uniform float uAspect;
    uniform mat3 uRotation;
    uniform float uZoom;

    varying vec3 vNormal;
    varying vec2 vUV;
    void main() {
        vec3 position = uRotation * aPosition;
        vNormal = aPosition;
        vUV = aUV;

        gl_Position = vec4(
            position.x * 0.75 * uZoom / uAspect,
            position.y * 0.75 * uZoom,
            -position.z * 0.75,
            1.0
        );
    }
`;


// Fragment Shader
const fragmentSource = `
    precision highp float;

    varying vec3 vNormal;
    varying vec2 vUV;

    uniform sampler2D uTexture;
    uniform sampler2D uHeight;
    uniform vec2 uTexel;
    uniform bool uBump;
    uniform float uStrength;
    uniform mat3 uRotation;
    uniform vec3 uLight;
    void main() {
        vec3 normal = normalize(vNormal);
        // 고도 맵을 이용해 법선 벡터 보정
        if (uBump) {
            float left = texture2D(uHeight,vUV - vec2(uTexel.x, 0.0)).r;
            float right = texture2D(uHeight,vUV + vec2(uTexel.x, 0.0)).r;
            float up = texture2D(uHeight,vUV - vec2(0.0, uTexel.y)).r;
            float down = texture2D(uHeight,vUV + vec2(0.0, uTexel.y)).r;

            float dU = right - left;
            float dV = down - up;

            float theta = vUV.x * 6.2831853 - 3.14159265;
            vec3 tangent = vec3(cos(theta), 0.0, -sin(theta));
            vec3 bitangent = normalize(cross(normal, tangent));

            normal = normalize(normal
                - tangent * dU * uStrength
                + bitangent * dV * uStrength
            );
        }

        normal = normalize(uRotation * normal);     // 회전된 법선 벡터
        vec3 light = normalize(uLight);             // 광원 및 조명 계산
        float brightness = max(dot(normal, light), 0.0);    // 지구 표면 색상

        vec3 color = texture2D(uTexture, vUV).rgb;
        gl_FragColor = vec4(color * (0.4 + 0.6 * brightness), 1.0);
    }
`;


// 셰이더 생성
function createShader(type, source) {

    const shader = gl.createShader(type);

    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        throw new Error(gl.getShaderInfoLog(shader));
    }

    return shader;
}

const vShader = createShader(gl.VERTEX_SHADER, vertexSource);
const fShader = createShader(gl.FRAGMENT_SHADER, fragmentSource);
const program = gl.createProgram();

gl.attachShader(program, vShader);
gl.attachShader(program, fShader);
gl.linkProgram(program);

if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program));
}

gl.useProgram(program);

// 구체 정점 및 UV 좌표 생성
const vertices = [];
const uv = [];
const indices = [];

const lan = 60;
const lon = 120;

for (let i = 0; i <= lan; i++) {
    const phi = -Math.PI / 2 + Math.PI * i / lan;

    for (let j = 0; j <= lon; j++) {
        const theta = -Math.PI + 2 * Math.PI * j / lon;

        const x = Math.cos(phi) * Math.sin(theta);
        const y = Math.sin(phi);
        const z = Math.cos(phi) * Math.cos(theta);
        vertices.push(x, y, z);

        const u = j / lon;
        const v = 1.0 - i / lan;
        uv.push(u, v);
    }
}

// 정점을 삼각형으로 연결
for (let i = 0; i < lan; i++) {
    for (let j = 0; j < lon; j++) {
        const first = i * (lon + 1) + j;
        const second = first + lon + 1;

        indices.push(first, second, first + 1);
        indices.push(second, second + 1, first + 1);
    }
}

// 정점 버퍼 생성
const vBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, vBuffer);
gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array(vertices),
    gl.STATIC_DRAW
);
const vLoc = gl.getAttribLocation(program, "aPosition");
gl.vertexAttribPointer(vLoc, 3, gl.FLOAT, false, 0, 0);
gl.enableVertexAttribArray(vLoc);

// 인덱스 버퍼 생성
const iBuffer = gl.createBuffer();
gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, iBuffer);
gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices),gl.STATIC_DRAW);

// UV 좌표 버퍼 생성
const uvBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, uvBuffer);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(uv),gl.STATIC_DRAW);
const uvLoc = gl.getAttribLocation(program, "aUV");

gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, 0, 0);
gl.enableVertexAttribArray(uvLoc);

// Uniform 변수 설정
const aspectLoc = gl.getUniformLocation(program, "uAspect");
const bumpLoc = gl.getUniformLocation(program, "uBump");
const strengthLoc = gl.getUniformLocation(program, "uStrength");
const texelLoc = gl.getUniformLocation(program, "uTexel");
const rotationLoc = gl.getUniformLocation(program, "uRotation");
const zoomLoc = gl.getUniformLocation(program, "uZoom");
const lightLoc = gl.getUniformLocation(program, "uLight");

gl.uniform1f(aspectLoc, canvas.width / canvas.height);
gl.uniform1f(strengthLoc, 20.0);
gl.uniform1f(zoomLoc, 1.0);

// 텍스처 불러오기
function loadTexture(src, unit, name) {
    return new Promise((resolve, reject) => {
        const texture = gl.createTexture();
        const image = new Image();

        image.onload = function () {
            gl.activeTexture(gl.TEXTURE0 + unit);
            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.texImage2D(
                gl.TEXTURE_2D,
                0,
                gl.RGBA,
                gl.RGBA,
                gl.UNSIGNED_BYTE,
                image
            );

            gl.texParameteri(
                gl.TEXTURE_2D,
                gl.TEXTURE_WRAP_S,
                gl.CLAMP_TO_EDGE
            );

            gl.texParameteri(
                gl.TEXTURE_2D,
                gl.TEXTURE_WRAP_T,
                gl.CLAMP_TO_EDGE
            );

            gl.texParameteri(
                gl.TEXTURE_2D,
                gl.TEXTURE_MIN_FILTER,
                gl.LINEAR
            );

            gl.texParameteri(
                gl.TEXTURE_2D,
                gl.TEXTURE_MAG_FILTER,
                gl.LINEAR
            );

            const loc = gl.getUniformLocation(program, name);
            gl.uniform1i(loc, unit);
            resolve(image);
        };

        image.onerror = function () {
            reject(new Error("이미지를 불러오지 못했습니다: " + src));
        };
        image.src = src;
    });
}

// 범프 매핑 체크박스
const bump = document.getElementById("bumpMapping");

// 회전 상태 및 버튼 설정
let angle = 0.0;
let direction = 0;
const speed = 0.4;
document.getElementById("reverse")
    .addEventListener("click", function () {direction = -1;});

document.getElementById("stop")
    .addEventListener("click", function () {direction = 0;});

document.getElementById("forward")
    .addEventListener("click", function () {direction = 1;});

// Y축 회전 행렬 생성
function createRotationMatrix(angle) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);

    return new Float32Array([
         c, 0, -s,
         0, 1,  0,
         s, 0,  c
    ]);
}

// 위도 및 경도 표시
const coordinates = document.getElementById("coordinates");

function updateCoordinates() {
    const latitude = 0;
    let longitude = -angle * 180 / Math.PI;
    longitude = ((longitude + 180) % 360 + 360)% 360 - 180;

    coordinates.textContent =
        "위도: " + latitude.toFixed(1) + "° / " +
        "경도: " + longitude.toFixed(1) + "°";
}


// 광원 위치 조절
const slider = document.getElementById("lightAngle");
function updateLight() {
    const rad = Number(slider.value)* Math.PI / 180;

    const x = Math.sin(rad);
    const y = 0.5;
    const z = Math.cos(rad);
    gl.uniform3f(lightLoc, x, y, z);
}


// 마우스 휠 확대 및 축소
let zoom = 1.0;
canvas.addEventListener("wheel", function (event) {
    event.preventDefault();

    if (event.deltaY < 0) {
        zoom *= 1.1;
    } else if (event.deltaY > 0) {zoom /= 1.1;}
    zoom = Math.max(0.5, Math.min(zoom, 4.0));
}, { passive: false });

// 지구 출력
let ready = false;
function draw() {
    if (!ready) {return;}
    gl.uniform1i(bumpLoc, bump.checked ? 1 : 0);   // 범프 매핑 적용

    // 회전 행렬 적용
    gl.uniformMatrix3fv(rotationLoc, false, createRotationMatrix(angle));
    gl.uniform1f(zoomLoc, zoom);        // 확대 배율 적용
    updateLight();                      // 광원 방향 적용

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_SHORT,0);
}

// 회전 애니메이션
let last = null;
function animate(now) {
    if (last === null) {last = now;}
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    angle += direction * speed * dt;
    angle %= 2 * Math.PI;

    updateCoordinates();
    draw();
    requestAnimationFrame(animate);
}

// 텍스처 로딩 및 프로그램 실행
Promise.all([
    loadTexture("assets/earth.jpg", 0, "uTexture"),
    loadTexture("assets/height.jpg", 1, "uHeight")
]).then(function (images) {

    const height = images[1];
    gl.uniform2f(
        texelLoc,
        1.0 / height.width,
        1.0 / height.height
    );
    ready = true;

    updateCoordinates();
    draw();
    requestAnimationFrame(animate);
}).catch(function (error) {
    console.error(error);
    alert(error.message);
});
