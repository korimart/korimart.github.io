"use strict";

// Hardcoded Data
const vLoc_pos = 3;
const vLoc_texcoord = 4;
const vLoc_normal = 5;
const sizeofFloat = Float32Array.BYTES_PER_ELEMENT;
const CAMERA_DISTANCE = 10.0;
const PIDIV2 = Math.PI / 2;
const oneDeg = Math.PI / 180;
const circleNumVer = 50;

const VSHADER_SOURCE = `#version 300 es
layout(location=${vLoc_pos}) in vec4 pos;
layout(location=${vLoc_texcoord}) in vec4 texcoord;

uniform mat4 mvp;

out vec2 fragTexcoord;

void main(){
    gl_Position = mvp * pos;
    fragTexcoord = texcoord.xy;
}
`;

const FSHADER_SOURCE_DICE = `#version 300 es
precision mediump float;

in vec2 fragTexcoord;
out vec4 fColor;
uniform sampler2D sampler;

void main(){
    vec4 sampled = texture(sampler, fragTexcoord);
    fColor = sampled;
}
`;

const FSHADER_SOURCE_LINE = `#version 300 es
precision mediump float;

out vec4 fColor;

uniform vec4 lineColor;

void main(){
    fColor = lineColor;
}
`;

// Create a cube
//    v6----- v5
//   /|      /|
//  v1------v0|
//  | |     | |
//  | |v7---|-|v4
//  |/      |/
//  v2------v3

let dicePositions = new Float32Array([   // Vertex coordinates
    1.0, 1.0, 1.0,  -1.0, 1.0, 1.0,  -1.0,-1.0, 1.0,   1.0,-1.0, 1.0,  // v0-v1-v2-v3 front
    1.0, 1.0, 1.0,   1.0,-1.0, 1.0,   1.0,-1.0,-1.0,   1.0, 1.0,-1.0,  // v0-v3-v4-v5 right
    1.0, 1.0, 1.0,   1.0, 1.0,-1.0,  -1.0, 1.0,-1.0,  -1.0, 1.0, 1.0,  // v0-v5-v6-v1 up
   -1.0, 1.0, 1.0,  -1.0, 1.0,-1.0,  -1.0,-1.0,-1.0,  -1.0,-1.0, 1.0,  // v1-v6-v7-v2 left
   -1.0,-1.0,-1.0,   1.0,-1.0,-1.0,   1.0,-1.0, 1.0,  -1.0,-1.0, 1.0,  // v7-v4-v3-v2 down
    1.0,-1.0,-1.0,  -1.0,-1.0,-1.0,  -1.0, 1.0,-1.0,   1.0, 1.0,-1.0   // v4-v7-v6-v5 back
 ]);

 let diceTexcoords = new Float32Array([
    0.75, 0.5,    0.75, 0.75,   0.5,  0.75,   0.5,  0.5,  // v0-v1-v2-v3 front(6)
    0.5,  0.0,    0.75, 0.0,    0.75, 0.25,   0.5,  0.25,  // v0-v3-v4-v5 right(5)
    0.75, 0.5,    0.5,  0.5,    0.5,  0.25,   0.75, 0.25,  // v0-v5-v6-v1 up(3)
    0.5,  0.5,    0.25, 0.5,    0.25, 0.25,   0.5,  0.25,  // v1-v6-v7-v2 left (2)
    0.75, 0.5,    0.75, 0.25,   1.0,  0.25,   1.0,  0.5,  // v7-v4-v3-v2 down (4)
    0.0,  0.25,   0.25, 0.25,   0.25, 0.5,    0.0,  0.5   // v4-v7-v6-v5 back (1)
 ]);

 let diceIndices = new Uint8Array([       // Indices of the vertices
    0, 1, 2,   0, 2, 3,    // front
    4, 5, 6,   4, 6, 7,    // right
    8, 9,10,   8,10,11,    // up
   12,13,14,  12,14,15,    // left
   16,17,18,  16,18,19,    // down
   20,21,22,  20,22,23     // back
 ]);

function main(){
    const canvas = document.getElementById("webgl");

    /** @type {WebGL2RenderingContext} */
    const gl = canvas.getContext("webgl2");
    if (!gl){
        console.log("Failed to get webGL Context");
        return;
    }

    if (!initShaders(gl, VSHADER_SOURCE, FSHADER_SOURCE_DICE)){
        console.log("Failed to create shaders program");
        return;
    }

    let diceProgram = gl.program;

    if (!initShaders(gl, VSHADER_SOURCE, FSHADER_SOURCE_LINE)){
        console.log("Failed to create shaders program");
        return;
    }

    let lineProgram = gl.program;

    let dicePosBuffer = gl.createBuffer();
    let diceTexcoordBuffer = gl.createBuffer();
    let diceIndexBuffer = gl.createBuffer();
    let linePosBuffer = gl.createBuffer();
    let linePositions = getCircleVertices(circleNumVer);
    let lineOfSightBuffer = gl.createBuffer();
    let lineOfSightPositions = new Float32Array([0.0, 0.0, 0.0, 0.0, 0.0, 0.0]);

    initArrayBuffer(gl, dicePosBuffer, dicePositions, 3, vLoc_pos)
    initArrayBuffer(gl, diceTexcoordBuffer, diceTexcoords, 2, vLoc_texcoord)
    initArrayBuffer(gl, linePosBuffer, linePositions, 3, vLoc_pos)
    initArrayBuffer(gl, lineOfSightBuffer, lineOfSightPositions, 3, vLoc_pos, gl.DYNAMIC_DRAW);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, diceIndexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, diceIndices, gl.STATIC_DRAW);

    // Set the clear color and enable the depth test
    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.enable(gl.DEPTH_TEST);

    // Set the eye point and the viewing volume
    let pMatrix = new Matrix4();
    pMatrix.setPerspective(30, 1, 1, 100);

    let image = new Image();
    let texture = gl.createTexture();
    let sampler = gl.getUniformLocation(gl.program, "sampler");
    image.onload = function() {
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1); // Flip the image's y axis
        // Enable texture unit0
        gl.activeTexture(gl.TEXTURE0);
        // Bind the texture object to the target
        gl.bindTexture(gl.TEXTURE_2D, texture);

        // Set the texture parameters
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        // Set the texture image
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image);

        // Set the texture unit 0 to the sampler
        gl.uniform1i(sampler, 0);
    }
    image.src = "dice.png";

    // camera
    let rho = CAMERA_DISTANCE;
    let theta = 0.0; // latitude
    let phi = 0.0; // longitude

    // input
    let longitudeBar = document.getElementById("longitude");
    let latitudeBar = document.getElementById("latitude");
    longitudeBar.oninput = function(event){
        phi = longitudeBar.value * Math.PI / 180;
    }
    latitudeBar.oninput = function(event){
        theta = latitudeBar.value * Math.PI / 180;
    }
    let roll = false;
    let button = document.getElementById("roll");
    button.onclick = function(event){
        roll = !roll;
    }

    let handleKey = function(event){
        switch (event.key){
            case "ArrowRight":
                theta += oneDeg;
                break;

            case "ArrowLeft":
                theta -= oneDeg;
                break;

            case "ArrowUp":
                phi += oneDeg;
                if (phi > PIDIV2)
                    phi -= oneDeg;
                break;

            case "ArrowDown":
                phi -= oneDeg;
                if (phi < -PIDIV2)
                    phi += oneDeg;
                break;

            case "r":
                theta = 0;
                phi = 0;
                break;

            }

        if (theta > 2 * Math.PI)
            theta -= 2 * Math.PI;
        else if (theta < 0)
            theta += 2 * Math.PI;
        longitudeBar.value = phi * 180 / Math.PI;
        latitudeBar.value = theta * 180 / Math.PI;
    }
    document.addEventListener("keydown", handleKey);

    let dicemvp = gl.getUniformLocation(diceProgram, "mvp");
    let linemvp = gl.getUniformLocation(lineProgram, "mvp");
    let lineColor = gl.getUniformLocation(lineProgram, "lineColor");

    let left_vpMatrix = new Matrix4(pMatrix);
    left_vpMatrix.translate(0, 0, -40);
    left_vpMatrix.rotate(20, 1, 0, 0);
    left_vpMatrix.rotate(-45, 0, 1, 0);

    // loop
    let angle = 0.0;
    let lastMS = Date.now();
    let loop = function() {
        let now = Date.now();
        let ms = now - lastMS;
        lastMS = now;

        angle += ms;

        function draw(vpMatrix){
            // Draw the cube
            gl.useProgram(diceProgram);
            let diceMVPMat = new Matrix4(vpMatrix);
            if (roll)
                diceMVPMat.rotate(angle, 1, 0, 0);
            gl.uniformMatrix4fv(dicemvp, false, diceMVPMat.elements);
            gl.bindBuffer(gl.ARRAY_BUFFER, dicePosBuffer);
            gl.vertexAttribPointer(vLoc_pos, 3, gl.FLOAT, false, 0, 0);
            gl.drawElements(gl.TRIANGLES, diceIndices.length, gl.UNSIGNED_BYTE, 0);

            // Draw horizontal line
            let horizontalMVPMat = new Matrix4(vpMatrix);
            horizontalMVPMat.scale(10, 10, 10);
            horizontalMVPMat.rotate(90, 1.0, 0.0, 0.0);

            gl.useProgram(lineProgram);
            gl.uniformMatrix4fv(linemvp, false, horizontalMVPMat.elements);
            gl.uniform4f(lineColor, 1.0, 1.0, 1.0, 1.0);

            gl.bindBuffer(gl.ARRAY_BUFFER, linePosBuffer);
            gl.vertexAttribPointer(vLoc_pos, 3, gl.FLOAT, false, 0, 0);
            gl.drawArrays(gl.LINE_LOOP, 0, linePositions.length / 3)

            // draw vertical line
            let vertMVPMat = new Matrix4(vpMatrix);
            vertMVPMat.scale(10, 10, 10);
            vertMVPMat.rotate(90 + theta * 180 / Math.PI, 0, 1, 0);

            gl.uniformMatrix4fv(linemvp, false, vertMVPMat.elements);
            gl.uniform4f(lineColor, 1.0, 1.0, 0.0, 1.0);
            gl.drawArrays(gl.LINE_LOOP, 0, linePositions.length / 3)

            // draw line of sight
            gl.uniformMatrix4fv(linemvp, false, vpMatrix.elements);
            gl.uniform4f(lineColor, 1.0, 0.0784, 0.5765, 1.0); // hot pink
            gl.bindBuffer(gl.ARRAY_BUFFER, lineOfSightBuffer);
            gl.vertexAttribPointer(vLoc_pos, 3, gl.FLOAT, false, 0, 0);
            gl.drawArrays(gl.LINES, 0, 2);
        }

        // Clear color and depth buffer
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        let [camX, camY, camZ] = getCartesion(rho, theta, phi);
        let camArray = new Float32Array([camX, camY, camZ]);
        gl.bindBuffer(gl.ARRAY_BUFFER, lineOfSightBuffer);
        gl.bufferSubData(gl.ARRAY_BUFFER, sizeofFloat * 3, camArray);

        // left
        gl.viewport(0, 0, 400, 400);
        draw(left_vpMatrix);

        // right
        let right_vpMatrix = new Matrix4(pMatrix);

        right_vpMatrix.translate(0, 0, -CAMERA_DISTANCE);
        right_vpMatrix.rotate(phi * 180 / Math.PI, 1, 0, 0);
        right_vpMatrix.rotate(-theta * 180 / Math.PI, 0, 1, 0);
        gl.viewport(400, 0, 400, 400);
        draw(right_vpMatrix);

        requestAnimationFrame(loop, canvas);
    }

    loop();

    console.log("End of JS");
}

function initArrayBuffer(gl, buffer, data, numFloat, attribIndex, usage=gl.STATIC_DRAW) {
    // Write date into the buffer object
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, usage);
    gl.vertexAttribPointer(attribIndex, numFloat, gl.FLOAT, false, 0, 0);
    // Enable the assignment of the buffer object to the attribute variable
    gl.enableVertexAttribArray(attribIndex);

    return true;
}

function getCartesion(rho, theta, phi){
    let z = rho * Math.cos(phi) * Math.cos(theta);
    let x = rho * Math.cos(phi) * Math.sin(theta);
    let y = rho * Math.sin(phi);
    return [x, y, z];
}

function getCircleVertices(numVert){
    if (numVert < 3)
        return;

    let angleDelta = 360 / numVert;
    let rotationMat = new Matrix4();
    rotationMat.setRotate(angleDelta, 0, 0, 1);
    let vector = new Vector3([1.0, 0.0, 0.0]);
    let float32Array = new Float32Array(numVert * 3);

    for (let i = 0; i < numVert; i++){
        vector = rotationMat.multiplyVector3(vector);
        float32Array[3 * i] = vector.elements[0];
        float32Array[3 * i + 1] = vector.elements[1];
        float32Array[3 * i + 2] = vector.elements[2];
    }

    return float32Array;
}