"use strict";

// Hardcoded Data
const vLoc_pos = 3;
const vLoc_color = 4;
const vLoc_size = 6;
const MAXINSTANCES = 30;
const sizeofFloat = Float32Array.BYTES_PER_ELEMENT;

const VSHADER_SOURCE = `#version 300 es
layout(location=${vLoc_pos}) in vec4 pos;

struct perInstanceStruct {
    mat4 transform;
    vec4 color;
};

uniform instancingBlock {
    perInstanceStruct perInstance[${MAXINSTANCES}];
};

out vec4 inColor;

void main(){
    // gl_Position = pos;
    gl_Position = perInstance[gl_InstanceID].transform * pos;
    inColor = perInstance[gl_InstanceID].color;
}
`;

const PSHADER_SOURCE = `#version 300 es
precision mediump float;

in vec4 inColor;
out vec4 fColor;

void main(){
    fColor = inColor;
    // fColor = vec4(1.0, 0.0, 0.0, 1.0);
}
`;

let inputLayoutPos = [
    new inputLayoutElement(vLoc_pos, 2), // pos, float2
];

let g_randomSize = false;
let g_randomAngularSpeed = false;

function inputLayoutElement(shaderIndex, numFloat32){
    this.shaderIndex = shaderIndex;
    this.numFloat32 = numFloat32;
}

function generatePrettyStar(long, short){
    let ret = [0.0, 0.0];

    let rotation72 = new Matrix4();
    rotation72.setRotate(72, 0, 0, 1);

    let rotation36 = new Matrix4();
    rotation36.setRotate(36, 0, 0, 1);
    
    let longVec = new Vector4([0, long, 0, 1]);
    let shortVec = rotation36.multiplyVector4(new Vector4([0, short, 0, 1]));
    ret.push(longVec.elements[0], longVec.elements[1], shortVec.elements[0], shortVec.elements[1]);
    
    for (let i = 0; i < 5; i++){
        longVec = rotation72.multiplyVector4(longVec);
        shortVec = rotation72.multiplyVector4(shortVec);
        ret.push(longVec.elements[0], longVec.elements[1], shortVec.elements[0], shortVec.elements[1]);
    }
    return new Float32Array(ret);
}

/** @param {WebGL2RenderingContext} gl
 *  @param {Float32Array[]} initDataList
*/
function createVAO(gl, initDataList, inputLayoutList, divisorList){
    let strideList = []
    for (let inputLayout of inputLayoutList){
        let stride = 0;
        for (let element of inputLayout)
            stride += element.numFloat32;
        stride *= sizeofFloat;
        strideList.push(stride);
    }

    // create VAO
    let vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    // create buffer
    for (let i = 0; i < initDataList.length; i++){
        let bufferName = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, bufferName);
        gl.bufferData(gl.ARRAY_BUFFER, initDataList[i], gl.STATIC_DRAW);
    
        let offset = 0;
        for (let element of inputLayoutList[i]){
            gl.vertexAttribPointer(element.shaderIndex, element.numFloat32, gl.FLOAT, false, strideList[i], offset);
            offset += sizeofFloat * element.numFloat32;
            gl.enableVertexAttribArray(element.shaderIndex);
            gl.vertexAttribDivisor(element.shaderIndex, divisorList[i]);
        }
    
        gl.bindBuffer(gl.ARRAY_BUFFER, null);
    }
    gl.bindVertexArray(null);

    let numVertices = initDataList[0].length / strideList[0] * sizeofFloat;
    return {vao, numVertices};
}

/** @param {WebGL2RenderingContext} gl */
function createUBO(gl, uniformBlockSize, bindingPoint){
    // create actual buffer
    let bufferName = gl.createBuffer();
    gl.bindBuffer(gl.UNIFORM_BUFFER, bufferName);
    gl.bufferData(gl.UNIFORM_BUFFER, uniformBlockSize, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.UNIFORM_BUFFER, null);

    gl.bindBufferBase(gl.UNIFORM_BUFFER, bindingPoint, bufferName);

    return bufferName;
}

/** @param {WebGL2RenderingContext} gl */
function bindUniformBlock(gl, program, uniformBlockName, bindingPoint){
    let blockIndex = gl.getUniformBlockIndex(program, uniformBlockName);
    gl.uniformBlockBinding(program, blockIndex, bindingPoint);
}

class Model {
    constructor(gl, dataList, inputLayoutList, divisorList, drawingMode){
        this.dataList = dataList;
        this.inputLayoutList = inputLayoutList;
        this.divisorList = divisorList;

        let {vao, numVertices} = createVAO(gl, dataList, inputLayoutList, divisorList);
        this.vao = vao;
        this.numVertices = numVertices;

        this.drawingMode = drawingMode;
    }
}

class Star {
    constructor(position, model, color, angle=0, size=1, angularSpeed=60, shrinkingSpeed=0.25){
        this.pos = position;
        this.model = model;
        this.color = color;
        this.color.push(1.0);
        this.angle = angle;
        this.size = size;
        this.angularSpeed = angularSpeed;
        this.shrinkingSpeed = shrinkingSpeed;
    }

    // instancing interface
    fillBuffer(buffer, offset){
        let first16 = new Float32Array(buffer, offset, 16);
        let last4 = new Float32Array(buffer, offset + sizeofFloat * 16, 4);

        let transform = new Matrix4();
        transform.elements = first16;
        transform.setTranslate(this.pos[0], this.pos[1], 0);
        transform.rotate(this.angle, 0, 0, 1);
        transform.scale(this.size, this.size, this.size);

        last4.set(new Float32Array(this.color), 0);
    }

    // intancing interface
    static instanceByteSize(){
        // transform mat + color vec4
        return sizeofFloat * 16 + sizeofFloat * 4;
    }

    // instancing interface
    instanceByteSize(){
        return this.constructor.instanceByteSize();
    }

    update(ms){
        // degree = angularSpeed / 1000 * ms
        this.angle += this.angularSpeed / 1000 * ms;
        // scale = shrinkingSpeed / 1000 * ms
        this.size -= this.shrinkingSpeed / 1000 * ms;
        if (this.size <= 0)
            this.pos = [100, 100];
    }
}

class Instancer {
    constructor(gl, program, blockName, blockByteSize, instanceList){
        this.instanceList = instanceList;
        this.uniformBindingPoint = 7;
        this.blockByteSize = blockByteSize;
        this.ubo = createUBO(gl, blockByteSize, this.uniformBindingPoint);
        this.CPUBuffer = new ArrayBuffer(blockByteSize);

        bindUniformBlock(gl, program, blockName, this.uniformBindingPoint);
    }

    uploadInstanceData(gl){
        if (this.instanceList.length > 0){
            let instanceSize = this.instanceList[0].instanceByteSize();
            for (let [index, instance] of this.instanceList.entries())
                instance.fillBuffer(this.CPUBuffer, instanceSize * index);
    
            gl.bindBuffer(gl.UNIFORM_BUFFER, this.ubo);
            gl.bufferSubData(gl.UNIFORM_BUFFER, 0, this.CPUBuffer);
            gl.bindBuffer(gl.UNIFORM_BUFFER, null);
        }
    }

    /** @param {WebGL2RenderingContext} gl */
    draw(gl){
        if (this.instanceList.length > 0){
            let model = this.instanceList[0].model;
            gl.bindVertexArray(model.vao);
            gl.drawArraysInstanced(model.drawingMode, 0, model.numVertices, this.instanceList.length);
            gl.bindVertexArray(null);
        }
    }
}

class CircularList {
    constructor(max){
        this.list = [];
        this.max = max;
        this.next = 0;
    }

    push(element){
        if (this.list.length < this.max)
            this.list.push(element)
        else {
            this.list[this.next++] = element;
            this.next %= this.max;
        }
    }
}

function makeStar(ev, canvas, starModel, starList) {
    let x = ev.clientX; // x coordinate of a mouse pointer
    let y = ev.clientY; // y coordinate of a mouse pointer
    let rect = ev.target.getBoundingClientRect();

    x = ((x - rect.left) - canvas.width/2)/(canvas.width/2);
    y = (canvas.height/2 - (y - rect.top))/(canvas.height/2);

    let color = [Math.random(), Math.random(), Math.random()];
    let scale = 1.0;
    let speed = 90;
    if (g_randomSize)
        scale = Math.random() * 2.0;
    if (g_randomAngularSpeed)
        speed = Math.random() * 360;

    let newStar = new Star([x, y], starModel, color, 0, scale, speed);
    starList.push(newStar);
}

function randomSize(element){
    g_randomSize = element.checked;
}

function randomAngularSpeed(element){
    g_randomAngularSpeed = element.checked;
}

function main(){
    const canvas = document.getElementById("webgl");
    
    /** @type {WebGL2RenderingContext} */
    const gl = canvas.getContext("webgl2");
    if (!gl){
        console.log("Failed to get webGL Context");
        return;
    }

    if (!initShaders(gl, VSHADER_SOURCE, PSHADER_SOURCE)){
        console.log("Failed to create shaders program");
        return;
    }

    // make objects
    let starModel = new Model(
        gl, 
        [generatePrettyStar(0.5, 0.25)],
        [inputLayoutPos],
        [0],
        gl.TRIANGLE_FAN
        );

    let starList = new CircularList(MAXINSTANCES);
    let instancer = new Instancer(gl, gl.program, "instancingBlock", Star.instanceByteSize() * MAXINSTANCES, starList.list);
    canvas.onmousedown = function(ev){ makeStar(ev, canvas, starModel, starList); }
    
    // loop
    let lastMS = Date.now();
    let loop = function() {
        let now = Date.now();
        let ms = now - lastMS;
        lastMS = now;
        
        // update and render
        for (let star of starList.list)
            star.update(ms);

        instancer.uploadInstanceData(gl);

        gl.clear(gl.COLOR_BUFFER_BIT);
        instancer.draw(gl);

        requestAnimationFrame(loop, canvas);
    }
    
    gl.clearColor(0, 0, 0, 1);
    loop();

    console.log("End of JS");
}