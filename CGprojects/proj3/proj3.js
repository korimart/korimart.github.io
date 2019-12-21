"use strict";

const loc_aPosition = 0;
const loc_aNormal = 1;
const loc_aTexCoord = 2;
const numLight = 1;
const earthScale = 0.5;
const moonScale = 0.2;

const VSHADER_SOURCE = `#version 300 es
precision mediump float;

layout(location=${loc_aPosition}) in vec4 pos;
layout(location=${loc_aTexCoord}) in vec4 texcoord;

uniform mat4 mvp;
uniform mat4 mv;
uniform float scale;
uniform sampler2D bumpSampler;

out vec3 fPos;
out vec2 fTexcoord;

void main(){
    // sphere
    vec3 disp = scale * pos.xyz * texture(bumpSampler, texcoord.xy).rgb;
    vec4 displacedPos = pos + vec4(disp, 0.0);
    gl_Position = mvp * displacedPos;
    fPos = vec3(mv * displacedPos);
    fTexcoord = texcoord.xy;
}
`;

const FSHADER_SOURCE_BLINN = `#version 300 es
precision mediump float;

#define PI 3.1415926538

struct lightStruct {
    vec4 ambient;
    vec4 diffuse;
    vec4 specular;
    vec4 position;
    vec4 direction;
};

struct materialStruct {
    vec4 ambient;
    vec4 diffuse;
    vec4 specular;
    float shininess;
};

uniform lightStruct lights[${numLight}];
uniform materialStruct material;
uniform mat4 mv;
uniform mat4 normalMV;
uniform float scale;
uniform float r0;

uniform sampler2D colorSampler;
uniform sampler2D specSampler;
uniform sampler2D bumpSampler;

in vec3 fPos;
in vec2 fTexcoord;

out vec4 fColor;

vec3 perturbNormal(sampler2D sampler, vec2 texCoord, float r0, float scale){
    float theta = 2.0 * PI * texCoord.s;
    float phi = (1.0 - texCoord.t) * PI;
    float r = r0 + texture(sampler, texCoord).r * scale;

    float sinPhi = sin(phi);
    float cosPhi = cos(phi);
    float sinTheta = sin(theta);
    float cosTheta = cos(theta);

    vec3 dPdTheta = vec3(
        -r * sinPhi * sinTheta,
        r * sinPhi * cosTheta,
        0.0
    );

    vec3 dPdPhi = vec3(
        r * cosPhi * cosTheta,
        r * cosPhi * sinTheta,
        -r * sinPhi
    );

    vec3 dPdr = vec3(
        sinPhi * cosTheta,
        sinPhi * sinTheta,
        cosPhi
    );

    float delta = 0.001;

    float drds = (texture(sampler, vec2(texCoord.s + delta, texCoord.t)).r
        - texture(sampler, vec2(texCoord.s - delta, texCoord.t)).r) / 2.0 / delta * scale;

    float drdt = (texture(sampler, vec2(texCoord.s, texCoord.t + delta)).r
        - texture(sampler, vec2(texCoord.s, texCoord.t - delta)).r) / 2.0 / delta * scale;

    vec3 dPds = dPdTheta * 2.0 * PI + dPdr * drds;
    vec3 dPdt = -dPdPhi * PI + dPdr * drdt;

    return normalize(cross(dPds, dPdt));
}

void main(){
    vec3 v = -fPos;
    vec3 n = normalize(mat3(normalMV) * perturbNormal(bumpSampler, fTexcoord, r0, scale));

    vec3 l = normalize(lights[0].position.xyz - fPos);
    vec3 h = normalize(l + v);
    float LdotN = max(dot(l, n), 0.0);
    vec3 ambientColor = lights[0].ambient.rgb;
    vec3 diffusiveColor = LdotN * texture(colorSampler, fTexcoord).xyz;
    vec3 specularColor = vec3(0.0);
    if (LdotN > 0.0){
        specularColor = pow(max(dot(n, h), 0.0), material.shininess) * texture(specSampler, fTexcoord).xyz
            * material.specular.xyz;
    }
    fColor = vec4(ambientColor + diffusiveColor + specularColor, 1.0);
}
`;

const FSHADER_SOURCE_NOLIGHTING = `#version 300 es
precision mediump float;

uniform sampler2D colorSampler;

in vec2 fTexcoord;

out vec4 fColor;

void main(){
    fColor = vec4(texture(colorSampler, fTexcoord).xyz, 1.0);
}
`;

function create_mesh_sphere(gl, SPHERE_DIV, loc_aPosition=0, loc_aNormal=1, loc_aTexCoord=2)
{ // Create a sphere
    let vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    let i;
    let j;
    let phi, sin_phi, cos_phi;
    let theta, sin_theta, cos_theta;
    let u, v;
    let p1, p2;

    let positions = [];
    let texcoords = [];
    let indices = [];

    // Generate coordinates
    for (j = 0; j <= SPHERE_DIV; j++)
    {
        v = 1.0 - j/SPHERE_DIV;
        phi = (1.0-v) * Math.PI;
        sin_phi = Math.sin(phi);
        cos_phi = Math.cos(phi);
        for (i = 0; i <= SPHERE_DIV; i++)
        {
            u = i/SPHERE_DIV;
            theta = u * 2 * Math.PI;
            sin_theta = Math.sin(theta);
            cos_theta = Math.cos(theta);

            positions.push(cos_theta * sin_phi);  // x
            positions.push(sin_theta * sin_phi);  // y
            positions.push(cos_phi);       // z

            texcoords.push(u);
            texcoords.push(v);
        }
    }

    // Generate indices
    for (j = 0; j < SPHERE_DIV; j++)
    {
        for (i = 0; i < SPHERE_DIV; i++)
        {
            p1 = j * (SPHERE_DIV+1) + i;
            p2 = p1 + (SPHERE_DIV+1);

            indices.push(p1);
            indices.push(p2);
            indices.push(p1 + 1);

            indices.push(p1 + 1);
            indices.push(p2);
            indices.push(p2 + 1);
        }
    }

    let buf_position = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf_position);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

    gl.vertexAttribPointer(loc_aPosition, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(loc_aPosition);

    let buf_texcoord = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf_texcoord);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(texcoords), gl.STATIC_DRAW);

    gl.vertexAttribPointer(loc_aTexCoord, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(loc_aTexCoord);

    let buf_normal = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf_normal);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

    gl.vertexAttribPointer(loc_aNormal, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(loc_aNormal);

    let buf_index = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buf_index);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);

    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);

    return new Mesh(buf_position, buf_normal, buf_texcoord, buf_index, indices.length, gl.UNSIGNED_SHORT,
        vao, "drawElements", gl.TRIANGLES, loc_aPosition, loc_aNormal, loc_aTexCoord);
}

function create_mesh_quad(gl, loc_aPosition=0, loc_aNormal=1, loc_aTexCoord=2){
    let vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    let positions = [1, 1, 0, 1, -1, 0, -1, -1, 0, -1, 1, 0];
    let texcoords = [1, 1, 1, 0, 0, 0, 0, 1];
    let indices = [0, 1, 3, 1, 2, 3];
    let normals = [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1];

    let buf_position = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf_position);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

    gl.vertexAttribPointer(loc_aPosition, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(loc_aPosition);

    let buf_texcoord = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf_texcoord);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(texcoords), gl.STATIC_DRAW);

    gl.vertexAttribPointer(loc_aTexCoord, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(loc_aTexCoord);

    let buf_normal = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf_normal);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(normals), gl.STATIC_DRAW);

    gl.vertexAttribPointer(loc_aNormal, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(loc_aNormal);

    let buf_index = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buf_index);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);

    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);

    return new Mesh(buf_position, buf_normal, buf_texcoord, buf_index, indices.length, gl.UNSIGNED_SHORT,
        vao, "drawElements", gl.TRIANGLES, loc_aPosition, loc_aNormal, loc_aTexCoord);
}

class Shader {
    constructor(vert, frag, uniformNames){
        this.vert = vert;
        this.frag = frag;
        this.uniformNames = uniformNames;
        this.compiled = false;
        this.uniformLocs = {};
    }

    compile(gl){
        // cuon-utils.js
        initShaders(gl, this.vert, this.frag);
        this.program = gl.program;

        if (this.uniformNames){
            for (let name of this.uniformNames)
                this.uniformLocs[name] = gl.getUniformLocation(this.program, name);
        }
        this.compiled = true;
    }

    bind(gl){
        if (!this.compiled)
            throw new Error("Shader not compiled");
        gl.useProgram(this.program);
    }
}

class Mesh {
    constructor(posBuffer, normalBuffer, texCoordBuffer, indexBuffer, indexNum,
        indexType, vao, drawFunc, mode, loc_aPosition=0, loc_aNormal=1, loc_aTexCoord=2){
            this.posBuffer = posBuffer;
            this.normalBuffer = normalBuffer;
            this.texCoordBuffer = texCoordBuffer;
            this.indexBuffer = indexBuffer;
            this.indexNum = indexNum;
            this.indexType = indexType;
            this.vao = vao;
            this.drawFunc = drawFunc;
            this.mode = mode;
            this.loc_aPosition = loc_aPosition;
            this.loc_aNormal = loc_aNormal;
            this.loc_aTexCoord = loc_aTexCoord;
    }

    render(gl){
        gl.bindVertexArray(this.vao);
        if (this.drawFunc == "drawElements")
            gl.drawElements(this.mode, this.indexNum, this.indexType, 0);
        else
            throw new Error("drawArray not supported");
    }
};

class Transform {
    constructor(){
        this.position = new Vector4([0, 0, 0, 1]);
        this.m = new Matrix4();
        this.normalM = new Matrix4();
    }

    bind(gl, shader, v, vp){
        gl.uniformMatrix4fv(shader.uniformLocs["m"], false, this.m.elements);

        let mv = new Matrix4(v);
        mv.concat(this.m);
        gl.uniformMatrix4fv(shader.uniformLocs["mv"], false, mv.elements);

        let mvp = new Matrix4(vp);
        mvp.concat(this.m);
        gl.uniformMatrix4fv(shader.uniformLocs["mvp"], false, mvp.elements);

        let normalMV = new Matrix4(v);
        normalMV.concat(this.normalM);
        gl.uniformMatrix4fv(shader.uniformLocs["normalMV"], false, normalMV.elements);
    }
};

class Material {
    constructor(ambient, diffuse, specular, shininess){
        this.ambient = ambient;
        this.diffuse = diffuse;
        this.specular = specular;
        this.shininess = shininess;
    }

    bind(gl, shader){
        gl.uniform4fv(shader.uniformLocs["material.ambient"], this.ambient.elements);
        gl.uniform4fv(shader.uniformLocs["material.diffuse"], this.diffuse.elements);
        gl.uniform4fv(shader.uniformLocs["material.specular"], this.specular.elements);
        gl.uniform1f(shader.uniformLocs["material.shininess"], this.shininess);
    }
}

class Texture {
    constructor(image, textureBuffer, textureUnit){
        this.image = image;
        this.textureBuffer = textureBuffer;
        this.textureUnit = textureUnit;
    }

    bind(gl, shader, samplerName){
        gl.activeTexture(gl.TEXTURE0 + this.textureUnit);
        gl.bindTexture(gl.TEXTURE_2D, this.textureBuffer);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.uniform1i(shader.uniformLocs[samplerName], this.textureUnit);
    }

    uploadTexture(gl){
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
        gl.activeTexture(gl.TEXTURE0 + this.textureUnit);
        gl.bindTexture(gl.TEXTURE_2D, this.textureBuffer);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.image);
    }
}

class Light {
    constructor(position, direction, ambient, diffuse, specular){
        this.position = position;
        this.direction = direction;
        this.ambient = ambient;
        this.diffuse = diffuse;
        this.specular = specular;
    }

    bind(gl, shader, lightIndex){
        gl.uniform4fv(shader.uniformLocs[`lights[${lightIndex}].position`], this.position.elements);
        gl.uniform4fv(shader.uniformLocs[`lights[${lightIndex}].direction`], this.direction.elements);
        gl.uniform4fv(shader.uniformLocs[`lights[${lightIndex}].ambient`], this.ambient.elements);
        gl.uniform4fv(shader.uniformLocs[`lights[${lightIndex}].diffuse`], this.diffuse.elements);
        gl.uniform4fv(shader.uniformLocs[`lights[${lightIndex}].specular`], this.specular.elements);
    }
}

class Camera {
    constructor(eyeX, eyeY, eyeZ, centerX, centerY, centerZ, upX, upY, upZ, fovy=90, aspect=1, near=0.1, far=100){
        this.eyePos = [eyeX, eyeY, eyeZ];
        this.centerPos = [centerX, centerY, centerZ];
        this.upDir = [upX, upY, upZ];
        this.v = new Matrix4();
        this.v.setLookAt(eyeX, eyeY, eyeZ, centerX, centerY, centerZ, upX, upY, upZ);
        this.p = new Matrix4();
        this.p.setPerspective(fovy, aspect, near, far);
        this.vp = new Matrix4(this.p);
        this.vp.multiply(this.v);
    }

    setCenter(x, y, z){
        this.centerPos = [x, y, z];
    }

    setEye(x, y, z){
        this.eyePos = [x, y, z];
    }

    recalMatrices(){
        this.v.setLookAt(...this.eyePos, ...this.centerPos, ...this.upDir);
        this.vp.set(this.p);
        this.vp.multiply(this.v);
    }
};

class BranchNode {
    constructor(matrix, parent=null){
        this.parent = parent;
        this.children = [];
        this.m = matrix;
    }

    addChild(branchNode){
        this.children.push(branchNode);
        return this.children.length - 1;
    }
}

class Branch {
    constructor(matrix){
        this.currNode = new BranchNode(matrix);
    }

    goToBranch(branchPoint){
        this.currNode = this.currNode.children[branchPoint];
        return branchPoint;
    }

    branchOut(){
        let newMatrix = new Matrix4(this.currNode.m);
        let childIndex = this.currNode.addChild(new BranchNode(newMatrix, this.currNode));
        this.currNode = this.currNode.children[childIndex];
        return childIndex;
    }

    goBack(){
        if (this.currNode.parent)
            this.currNode = this.currNode.parent;
    }

    getMatrix(){
        return this.currNode.m;
    }

    reset(matrix){
        this.currNode = new BranchNode(matrix);
    }
};

class Timer {
    constructor(){
        this.lastMS = Date.now();
        this.ms = 0;
    }

    tick(){
        let now = Date.now();
        this.ms = now - this.lastMS;
        this.lastMS = now;
    }

    getMS(){
        return this.ms;
    }
}

function loadImage(url, resolve, reject){
    let image = new Image();
    image.src = url;
    image.onload = () => resolve(image);
};

function normalizeArray(array){
    let length = 0;
    for (let item of array)
        length += item * item;
    length = Math.sqrt(length);
    return array.map(x => x / length);
}

function main(){
    const canvas = document.getElementById("webgl");

    /** @type {WebGL2RenderingContext} */
    const gl = canvas.getContext("webgl2");
    if (!gl){
        console.log("Failed to get webGL Context");
        return;
    }

    gl.enable(gl.DEPTH_TEST);
    gl.clearColor(0, 0, 0, 1);

    let light = new Light(new Vector4(), new Vector4([1, 1, 1, 0]), new Vector4([0.05, 0.05, 0.05, 0.0]),
    new Vector4(), new Vector4());

    let blinnShader = new Shader(VSHADER_SOURCE, FSHADER_SOURCE_BLINN, ["mvp", "mv", "scale", "bumpSampler",
        "colorSampler", "specSampler", "lights[0].ambient", "lights[0].direction", "material.specular",
        "material.shininess", "r0", "normalMV", "lights[0].position"]);
    blinnShader.compile(gl);

    let sunShader = new Shader(VSHADER_SOURCE, FSHADER_SOURCE_NOLIGHTING, ["colorSampler", "mvp", "mv"]);
    sunShader.compile(gl);

    let sunCamera = new Camera(0, 0, 4.5, 0, 0, 0, 0, 1, 0, 50, 2);
    let earthCamera = new Camera(0, 0, 0, 0, 0, 0, 0, 1, 0, 50, 1);
    let moonCamera = new Camera(0, 0, 0, 0, 0, 0, 0, 1, 0, 50, 1);

    let sphereMesh = create_mesh_sphere(gl, 100);
    let quadMesh = create_mesh_quad(gl);

    let earthMaterial = new Material(new Vector4(), new Vector4(), new Vector4([1, 1, 1, 1]), 500.0);
    let moonMaterial = new Material(new Vector4(), new Vector4(), new Vector4(), 0.0);

    let sunTransform = new Transform();
    let earthTransform = new Transform();
    let moonTransform = new Transform();

    // texture objects
    let earthBump, earthSpec, earthColor;
    let moonBump, moonColor;
    let sunColor;

    // miscellaneous
    let cameraLight = true;
    let lightPos = [0, 0, 0, 1];
    let flatEarth = false;
    let flatMessages = ["I believe in Flat Earth", "No, I don't"];
    let lowerMessages = ["Light up lower viewports", "Use Sun lighting for lower viewports"];

    let earthDayAngle = 0;
    let earthYearAngle = 0;
    let moonDayAngle = 0;
    let moonYearAngle = 0;

    let earthDayAngleScale = 10; // 0 ~ 50
    let earthYearAngleScale = 1; // 0 ~ 10
    let earthHeightScale = 0.1; // 0 ~ 1
    let moonDayAngleScale = 5; // 0 ~ 25
    let moonYearAngleScale = 1; // 0 ~ 10
    let moonHeightScale = 0.005; // 0 ~ 0.5

    let earthRotBar = document.getElementById("earthRotaton");
    let earthRevBar = document.getElementById("earthRevolution");
    let earthHeightBar = document.getElementById("earthHeight");
    let moonRotBar = document.getElementById("moonRotation");
    let moonRevBar = document.getElementById("moonRevolution");
    let moonHeightBar = document.getElementById("moonHeight");
    let ltblButton = document.getElementById("ltbl");
    ltblButton.value = lowerMessages[Number(cameraLight)];
    let flatButton = document.getElementById("flat");
    flatButton.value = flatMessages[Number(flatEarth)];

    earthRotBar.oninput = event => earthDayAngleScale = earthRotBar.value / 2;
    earthRevBar.oninput = event => earthYearAngleScale = earthRevBar.value / 10;
    earthHeightBar.oninput = event => earthHeightScale = earthHeightBar.value / 100;
    moonRotBar.oninput = event => moonDayAngleScale = moonRotBar.value / 4;
    moonRevBar.oninput = event => moonYearAngleScale = moonRevBar.value / 10;
    moonHeightBar.oninput = event => moonHeightScale = moonHeightBar.value / 200;
    ltblButton.onclick = function(event){
        cameraLight = !cameraLight;
        ltblButton.value = lowerMessages[Number(cameraLight)];
    };
    flatButton.onclick = function(event){
        flatEarth = !flatEarth;
        flatButton.value = flatMessages[Number(flatEarth)];
    };

    let angle = 0;
    let timer = new Timer();
    let branch = new Branch(new Matrix4());

    let loop = function() {
        timer.tick();
        angle =  timer.getMS() / 40;
        earthDayAngle += angle * earthDayAngleScale;
        earthYearAngle += angle * earthYearAngleScale;
        moonDayAngle += angle * moonDayAngleScale;
        moonYearAngle += angle * moonYearAngleScale;

        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        sunShader.bind(gl);
        light.position = sunCamera.v.multiplyVector4(new Vector4(lightPos));
        light.bind(gl, sunShader, 0);

        branch.reset(new Matrix4());
        branch.branchOut();
        branch.getMatrix().rotate(-90, 1, 0, 0);

        sunTransform.m = branch.getMatrix();
        sunTransform.normalM = sunTransform.m;
        sunTransform.bind(gl, sunShader, sunCamera.v, sunCamera.vp);

        // draw sun
        gl.viewport(0, 512, 1024, 512);

        sunColor.bind(gl, sunShader, "colorSampler");
        sunTransform.bind(gl, sunShader, sunCamera.v, sunCamera.vp);
        sphereMesh.render(gl);

        // draw earth and moon
        blinnShader.bind(gl);

        branch.goBack();
        let moonBranchPoint = branch.branchOut();
        branch.getMatrix().rotate(earthYearAngle, 0, 1, 0);
        branch.getMatrix().translate(3, 0, 0);

        // store earth position for later
        let earthPosition = branch.getMatrix().multiplyVector4(earthTransform.position);

        // go back not to rotate 23.5-degree-axis of earth (4 seasons!)
        branch.goBack();
        branch.branchOut();
        branch.getMatrix().translate(...earthPosition.elements);
        branch.getMatrix().rotate(23.5, 0, 0, 1);
        branch.getMatrix().rotate(earthDayAngle, 0, 1, 0);
        branch.getMatrix().rotate(-90, 1, 0, 0);
        branch.getMatrix().scale(earthScale, earthScale, earthScale);

        earthTransform.m = branch.getMatrix();
        earthTransform.normalM = branch.getMatrix();

        earthCamera.setCenter(...earthPosition.elements);
        earthCamera.setEye(...earthPosition.elements);
        earthCamera.eyePos[2] += 2;
        if (flatEarth)
            earthCamera.eyePos[1] += 0.5;
        earthCamera.recalMatrices();

        branch.goBack();
        branch.goToBranch(moonBranchPoint);
        branch.getMatrix().rotate(moonYearAngle, 0, 1, 0);
        branch.getMatrix().translate(1, 0, 0);
        branch.getMatrix().rotate(moonDayAngle, 0, 1, 0);
        branch.getMatrix().rotate(-90, 1, 0, 0);
        branch.getMatrix().scale(moonScale, moonScale, moonScale);

        let moonPosition = branch.getMatrix().multiplyVector4(moonTransform.position);
        let earthToMoonVec = new Float32Array(moonPosition.elements);
        for (let i = 0; i < 3; i++)
            earthToMoonVec[i] -= earthPosition.elements[i];
        let i = 0;
        let moonCamPos = earthPosition.elements.map(x => x + earthToMoonVec[i++] * 0.25);

        moonCamera.setCenter(...moonPosition.elements);
        moonCamera.setEye(...moonCamPos);
        moonCamera.recalMatrices();

        moonTransform.m = branch.getMatrix();
        moonTransform.normalM = branch.getMatrix();

        light.position = sunCamera.v.multiplyVector4(new Vector4(lightPos));
        light.bind(gl, blinnShader, 0);

        // draw earth
        gl.uniform1f(blinnShader.uniformLocs["scale"], earthHeightScale);
        gl.uniform1f(blinnShader.uniformLocs["r0"], earthScale);
        earthColor.bind(gl, blinnShader, "colorSampler");
        earthBump.bind(gl, blinnShader, "bumpSampler");
        earthTransform.bind(gl, blinnShader, sunCamera.v, sunCamera.vp);
        earthMaterial.bind(gl, blinnShader);
        if (flatEarth)
            quadMesh.render(gl);
        else
            sphereMesh.render(gl);

        // draw lower earth
        gl.viewport(0, 0, 512, 512);
        light.position = earthCamera.v.multiplyVector4(new Vector4(cameraLight ? [...earthCamera.eyePos, 1] : lightPos));
        light.bind(gl, blinnShader, 0);
        earthTransform.bind(gl, blinnShader, earthCamera.v, earthCamera.vp);
        if (flatEarth)
            quadMesh.render(gl);
        else
            sphereMesh.render(gl);

        // draw moon
        gl.viewport(0, 512, 1024, 512);

        light.position = sunCamera.v.multiplyVector4(new Vector4(lightPos));
        light.bind(gl, blinnShader, 0);

        gl.uniform1f(blinnShader.uniformLocs["scale"], moonHeightScale);
        gl.uniform1f(blinnShader.uniformLocs["r0"], moonScale);
        moonColor.bind(gl, blinnShader, "colorSampler");
        moonBump.bind(gl, blinnShader, "bumpSampler");
        moonMaterial.bind(gl, blinnShader);
        moonTransform.bind(gl, blinnShader, sunCamera.v, sunCamera.vp);
        sphereMesh.render(gl);

        // draw moon camera moon
        gl.viewport(512, 0, 512, 512);

        light.position = moonCamera.v.multiplyVector4(new Vector4(cameraLight ? [...moonCamera.eyePos, 1] : lightPos));
        light.bind(gl, blinnShader, 0);

        moonTransform.bind(gl, blinnShader, moonCamera.v, moonCamera.vp);
        sphereMesh.render(gl);

        requestAnimationFrame(loop, canvas);
    }

    // load texture
    Promise.all([
        new Promise((resolve, reject) => loadImage("earthmap1k.jpg", resolve, reject)),
        new Promise((resolve, reject) => loadImage("earthspec1k.jpg", resolve, reject)),
        new Promise((resolve, reject) => loadImage("earthbump1k.jpg", resolve, reject)),
        new Promise((resolve, reject) => loadImage("moonmap1k.jpg", resolve, reject)),
        new Promise((resolve, reject) => loadImage("moonbump1k.jpg", resolve, reject)),
        new Promise((resolve, reject) => loadImage("2k_sun.jpg", resolve, reject)),
        new Promise(function(resolve, reject){
            let p = document.createElement("p");
            p.textContent = "Loading images...";
            p.id = "loading";
            p.style = "color: red";
            document.body.append(p);
            resolve();
        })
    ]).then(
        function (responses){
            let p = document.getElementById("loading");
            p.remove();

            let i = 0;
            let texture;
            texture = gl.createTexture();
            earthColor = new Texture(responses[i++], texture, 0);
            texture = gl.createTexture();
            earthSpec = new Texture(responses[i++], texture, 1);
            texture = gl.createTexture();
            earthBump = new Texture(responses[i++], texture, 2);
            texture = gl.createTexture();
            moonColor = new Texture(responses[i++], texture, 0);
            texture = gl.createTexture();
            moonBump = new Texture(responses[i++], texture, 1);
            texture = gl.createTexture();
            sunColor = new Texture(responses[i], texture, 0);

            earthColor.uploadTexture(gl);
            earthBump.uploadTexture(gl);
            earthSpec.uploadTexture(gl);
            sunColor.uploadTexture(gl);
            moonColor.uploadTexture(gl);
            moonBump.uploadTexture(gl);

            blinnShader.bind(gl);
            earthSpec.bind(gl, blinnShader, "specSampler");
            loop();
        }
    );

    console.log("end of js");
}