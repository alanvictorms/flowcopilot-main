import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { ConvexGeometry } from "three/examples/jsm/geometries/ConvexGeometry.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { FilmPass } from "three/examples/jsm/postprocessing/FilmPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

/**
 * BrainNetwork — cérebro neural 3D (port do brain2.html).
 * Malha convexa de cérebro (cérebro + cerebelo + tronco), shaders de pulso,
 * bloom e facetas translúcidas. Clique dispara pulso; arraste gira.
 * Props:
 *  - itemCount: número de memórias exibido no rodapé
 *  - height: altura do canvas (px)
 */

const COLOR_PALETTES = [
  [0xd8f6ff, 0x8fe4ff, 0x45ccff, 0x18a6ee, 0x0c7cc4],
  [0xf2f8ff, 0xc9e2ff, 0x9cc8ff, 0x6fa6ef, 0x4478c8],
  [0xf1e9ff, 0xd3b8ff, 0xa78bfa, 0x7c6cf5, 0x5246d6],
  [0xffffff, 0xe4ebf3, 0xbecdde, 0x93a9c4, 0x6a83a6],
];
const THEME_SWATCHES = [
  "linear-gradient(45deg,#A1E633,#aee359,#51b40e,#0A5FA8)",
  "linear-gradient(45deg,#EAF4FF,#9CC8FF,#4A7FD4,#1E3A6E)",
  "linear-gradient(45deg,#E3D4FF,#A78BFA,#6D5BF0,#3730A3)",
  "linear-gradient(45deg,#FFFFFF,#D7E2EE,#9FB3CC,#5C7695)",
];
const BACKGROUND_COLOR = 0x051228;

const noiseFunctions = `
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
    const vec2 C=vec2(1.0/6.0,1.0/3.0);const vec4 D=vec4(0.0,0.5,1.0,2.0);
    vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);vec3 g=step(x0.yzx,x0.xyz);
    vec3 l=1.0-g;vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);
    vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;i=mod289(i);
    vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
    float n_=0.142857142857;vec3 ns=n_*D.wyz-D.xzx;
    vec4 j=p-49.0*floor(p*ns.z*ns.z);vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.0*x_);
    vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.0-abs(x)-abs(y);
    vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);vec4 s0=floor(b0)*2.0+1.0;vec4 s1=floor(b1)*2.0+1.0;
    vec4 sh=-step(h,vec4(0.0));vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
    vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);
    vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
    p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);
    m*=m;return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
float fbm(vec3 p,float time){
    float value=0.0;float amplitude=0.5;float frequency=1.0;int octaves=3;
    for(int i=0;i<octaves;i++){
        value+=amplitude*snoise(p*frequency+time*0.2*frequency);
        amplitude*=0.5;frequency*=2.0;
    }
    return value;
}`;

const nodeShader = {
  vertexShader: `${noiseFunctions}
  attribute float nodeSize;attribute float nodeType;attribute vec3 nodeColor;attribute vec3 connectionIndices;attribute float distanceFromRoot;
  uniform float uTime;uniform vec3 uPulsePositions[3];uniform float uPulseTimes[3];uniform float uPulseSpeed;uniform float uBaseNodeSize;
  varying vec3 vColor;varying float vNodeType;varying vec3 vPosition;varying float vPulseIntensity;varying float vDistanceFromRoot;

  float getPulseIntensity(vec3 worldPos, vec3 pulsePos, float pulseTime) {
      if (pulseTime < 0.0) return 0.0;
      float timeSinceClick = uTime - pulseTime;
      if (timeSinceClick < 0.0 || timeSinceClick > 3.0) return 0.0;
      float pulseRadius = timeSinceClick * uPulseSpeed;
      float distToClick = distance(worldPos, pulsePos);
      float pulseThickness = 2.0;
      float waveProximity = abs(distToClick - pulseRadius);
      return smoothstep(pulseThickness, 0.0, waveProximity) * smoothstep(3.0, 0.0, timeSinceClick);
  }

  void main() {
      vNodeType = nodeType;
      vColor = nodeColor;
      vDistanceFromRoot = distanceFromRoot;
      vec3 worldPos = (modelMatrix * vec4(position, 1.0)).xyz;
      vPosition = worldPos;
      float totalPulseIntensity = 0.0;
      for (int i = 0; i < 3; i++) {
          totalPulseIntensity += getPulseIntensity(worldPos, uPulsePositions[i], uPulseTimes[i]);
      }
      vPulseIntensity = min(totalPulseIntensity, 1.0);
      float timeScale = 0.5 + 0.5 * sin(uTime * 0.8 + distanceFromRoot * 0.2);
      float baseSize = nodeSize * (0.8 + 0.2 * timeScale);
      float pulseSize = baseSize * (1.0 + vPulseIntensity * 2.0);
      vec3 modifiedPosition = position;
      if (nodeType > 0.5) {
          float noise = fbm(position * 0.1, uTime * 0.1);
          modifiedPosition += normal * noise * 0.2;
      }
      vec4 mvPosition = modelViewMatrix * vec4(modifiedPosition, 1.0);
      gl_PointSize = pulseSize * uBaseNodeSize * (800.0 / -mvPosition.z);
      gl_Position = projectionMatrix * mvPosition;
  }`,
  fragmentShader: `
  uniform float uTime;uniform vec3 uPulseColors[3];uniform int uActivePalette;
  varying vec3 vColor;varying float vNodeType;varying vec3 vPosition;varying float vPulseIntensity;varying float vDistanceFromRoot;

  void main() {
      vec2 center = 2.0 * gl_PointCoord - 1.0;
      float dist = length(center);
      if (dist > 1.0) discard;
      float glowStrength = 1.0 - smoothstep(0.0, 1.0, dist);
      glowStrength = pow(glowStrength, 1.4);
      vec3 baseColor = vColor * (0.8 + 0.2 * sin(uTime * 0.5 + vDistanceFromRoot * 0.3));
      vec3 finalColor = baseColor;
      if (vPulseIntensity > 0.0) {
          vec3 pulseColor = mix(vec3(1.0), uPulseColors[0], 0.3);
          finalColor = mix(baseColor, pulseColor, vPulseIntensity);
          finalColor *= (1.0 + vPulseIntensity * 0.7);
      }
      float alpha = glowStrength * (0.9 - 0.5 * dist);
      float camDistance = length(vPosition - cameraPosition);
      float distanceFade = smoothstep(80.0, 10.0, camDistance);
      if (vNodeType > 0.5) { alpha *= 0.85; } else { finalColor *= 1.2; }
      gl_FragColor = vec4(finalColor, alpha * distanceFade);
  }`,
};

const connectionShader = {
  vertexShader: `${noiseFunctions}
  attribute vec3 startPoint;attribute vec3 endPoint;attribute float connectionStrength;attribute float pathIndex;attribute vec3 connectionColor;
  uniform float uTime;uniform vec3 uPulsePositions[3];uniform float uPulseTimes[3];uniform float uPulseSpeed;
  varying vec3 vColor;varying float vConnectionStrength;varying float vPulseIntensity;varying float vPathPosition;

  float getPulseIntensity(vec3 worldPos, vec3 pulsePos, float pulseTime) {
      if (pulseTime < 0.0) return 0.0;
      float timeSinceClick = uTime - pulseTime;
      if (timeSinceClick < 0.0 || timeSinceClick > 3.0) return 0.0;
      float pulseRadius = timeSinceClick * uPulseSpeed;
      float distToClick = distance(worldPos, pulsePos);
      float pulseThickness = 2.0;
      float waveProximity = abs(distToClick - pulseRadius);
      return smoothstep(pulseThickness, 0.0, waveProximity) * smoothstep(3.0, 0.0, timeSinceClick);
  }

  void main() {
      float t = position.x;
      vPathPosition = t;
      vec3 midPoint = mix(startPoint, endPoint, 0.5);
      float pathOffset = sin(t * 3.14159) * 0.1;
      vec3 perpendicular = normalize(cross(normalize(endPoint - startPoint), vec3(0.0, 1.0, 0.0)));
      if (length(perpendicular) < 0.1) perpendicular = vec3(1.0, 0.0, 0.0);
      midPoint += perpendicular * pathOffset;
      vec3 p0 = mix(startPoint, midPoint, t);
      vec3 p1 = mix(midPoint, endPoint, t);
      vec3 finalPos = mix(p0, p1, t);
      float noiseTime = uTime * 0.2;
      float noise = fbm(vec3(pathIndex * 0.1, t * 0.5, noiseTime), noiseTime);
      finalPos += perpendicular * noise * 0.1;
      vec3 worldPos = (modelMatrix * vec4(finalPos, 1.0)).xyz;
      float totalPulseIntensity = 0.0;
      for (int i = 0; i < 3; i++) {
          totalPulseIntensity += getPulseIntensity(worldPos, uPulsePositions[i], uPulseTimes[i]);
      }
      vPulseIntensity = min(totalPulseIntensity, 1.0);
      vColor = connectionColor;
      vConnectionStrength = connectionStrength;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(finalPos, 1.0);
  }`,
  fragmentShader: `
  uniform float uTime;uniform vec3 uPulseColors[3];
  varying vec3 vColor;varying float vConnectionStrength;varying float vPulseIntensity;varying float vPathPosition;

  void main() {
      vec3 baseColor = vColor * (0.7 + 0.3 * sin(uTime * 0.5 + vPathPosition * 10.0));
      float flowPattern = sin(vPathPosition * 20.0 - uTime * 3.0) * 0.5 + 0.5;
      float flowIntensity = 0.3 * flowPattern * vConnectionStrength;
      vec3 finalColor = baseColor;
      if (vPulseIntensity > 0.0) {
          vec3 pulseColor = mix(vec3(1.0), uPulseColors[0], 0.3);
          finalColor = mix(baseColor, pulseColor, vPulseIntensity);
          flowIntensity += vPulseIntensity * 0.5;
      }
      finalColor *= (0.6 + flowIntensity + vConnectionStrength * 0.4);
      float alpha = 0.8 * vConnectionStrength + 0.2 * flowPattern;
      alpha = mix(alpha, min(1.0, alpha * 2.0), vPulseIntensity);
      gl_FragColor = vec4(finalColor, alpha);
  }`,
};

class Node {
  constructor(position, level = 0, type = 0) {
    this.position = position;
    this.connections = [];
    this.level = level;
    this.type = type;
    this.size = type === 0 ? THREE.MathUtils.randFloat(0.7, 1.2) : THREE.MathUtils.randFloat(0.4, 0.9);
    this.distanceFromRoot = 0;
  }
  addConnection(node, strength = 1.0) {
    if (!this.isConnectedTo(node)) {
      this.connections.push({ node, strength });
      node.connections.push({ node: this, strength });
    }
  }
  isConnectedTo(node) {
    return this.connections.some((conn) => conn.node === node);
  }
}

function generateNeuralNetwork(densityFactor = 1.0) {
  let nodes = [];
  let rootNode;
  const facetTriangles = [];

  function generateBrainFormation() {
    rootNode = new Node(new THREE.Vector3(0, 0, 0), 2, 1);
    rootNode.size = 0.7;
    rootNode.distanceFromRoot = 0;
    nodes.push(rootNode);

    const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
    const RX = 9.2, RY = 6.6, RZ = 7.0;
    const TILT = 0.1;
    const Z_AXIS = new THREE.Vector3(0, 0, 1);

    function surfNoise(d) {
      return 0.5 * Math.sin(3.1 * d.x + 1.3) * Math.sin(2.7 * d.y + 4.2)
        + 0.3 * Math.sin(4.3 * d.y + 2.1) * Math.sin(3.7 * d.z + 0.8)
        + 0.2 * Math.sin(5.1 * d.z + 3.3) * Math.sin(4.7 * d.x + 5.1);
    }

    function fibonacciDir(i, n, jitter) {
      const y = 1 - (2 * (i + 0.5)) / n;
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      const theta = GOLDEN_ANGLE * i;
      return new THREE.Vector3(Math.cos(theta) * r, y, Math.sin(theta) * r)
        .add(new THREE.Vector3(
          THREE.MathUtils.randFloatSpread(jitter),
          THREE.MathUtils.randFloatSpread(jitter),
          THREE.MathUtils.randFloatSpread(jitter)
        )).normalize();
    }

    function deformCerebrum(p) {
      if (p.y > 0) {
        p.y -= Math.exp(-Math.pow(p.z / 1.4, 2)) * (p.y / RY) * 0.9;
      }
      if (p.y < 0) {
        const backness = THREE.MathUtils.smoothstep(p.x, -2, RX);
        p.y *= 0.8 - 0.25 * backness;
      }
      p.applyAxisAngle(Z_AXIS, TILT);
      return p;
    }

    function cerebrumPoint(dir) {
      const radial = 1 + 0.05 * surfNoise(dir);
      return deformCerebrum(new THREE.Vector3(dir.x * RX, dir.y * RY, dir.z * RZ).multiplyScalar(radial));
    }

    function levelFromHeight(y) {
      const h = THREE.MathUtils.clamp((y + RY) / (2 * RY), 0, 1);
      let level = 4 - Math.round(h * 4);
      if (Math.random() < 0.3) level += Math.random() < 0.5 ? -1 : 1;
      return THREE.MathUtils.clamp(level, 0, 4);
    }

    function buildHullPart(points, makeNode) {
      const geometry = new ConvexGeometry(points);
      const pos = geometry.getAttribute("position");
      const vertexMap = new Map();
      const partNodes = [];
      const keyOf = (v) => `${v.x.toFixed(3)}|${v.y.toFixed(3)}|${v.z.toFixed(3)}`;

      function nodeFor(v) {
        const key = keyOf(v);
        if (!vertexMap.has(key)) {
          const node = makeNode(v.clone());
          node.distanceFromRoot = node.position.length();
          nodes.push(node);
          partNodes.push(node);
          vertexMap.set(key, node);
        }
        return vertexMap.get(key);
      }

      const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
      for (let i = 0; i < pos.count; i += 3) {
        a.fromBufferAttribute(pos, i);
        b.fromBufferAttribute(pos, i + 1);
        c.fromBufferAttribute(pos, i + 2);
        facetTriangles.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
        const na = nodeFor(a), nb = nodeFor(b), nc = nodeFor(c);
        na.addConnection(nb, THREE.MathUtils.randFloat(0.5, 0.8));
        nb.addConnection(nc, THREE.MathUtils.randFloat(0.5, 0.8));
        nc.addConnection(na, THREE.MathUtils.randFloat(0.5, 0.8));
      }
      geometry.dispose();
      return partNodes;
    }

    const cerebrumCount = Math.max(50, Math.floor(230 * densityFactor));
    const cerebrumPoints = [];
    for (let i = 0; i < cerebrumCount; i++) {
      cerebrumPoints.push(cerebrumPoint(fibonacciDir(i, cerebrumCount, 0.24)));
    }
    const cerebrumNodes = buildHullPart(cerebrumPoints, (p) => {
      const node = new Node(p, levelFromHeight(p.y), Math.random() < 0.25 ? 1 : 0);
      node.size = Math.random() < 0.08
        ? THREE.MathUtils.randFloat(1.1, 1.45)
        : THREE.MathUtils.randFloat(0.5, 0.95);
      return node;
    });

    const cbCenter = new THREE.Vector3(4.5, -4.5, 0);
    const CBX = 3.0, CBY = 2.3, CBZ = 2.9;
    const cerebellumCount = Math.max(20, Math.floor(70 * densityFactor));
    const cerebellumPoints = [];
    for (let i = 0; i < cerebellumCount; i++) {
      const dir = fibonacciDir(i, cerebellumCount, 0.26);
      const radial = 1 + 0.06 * surfNoise(dir);
      cerebellumPoints.push(new THREE.Vector3(dir.x * CBX, dir.y * CBY, dir.z * CBZ)
        .multiplyScalar(radial).add(cbCenter));
    }
    const cerebellumNodes = buildHullPart(cerebellumPoints, (p) => {
      const node = new Node(p, THREE.MathUtils.randInt(2, 4), Math.random() < 0.25 ? 1 : 0);
      node.size = THREE.MathUtils.randFloat(0.45, 0.85);
      return node;
    });

    const stemTop = new THREE.Vector3(2.0, -4.0, 0);
    const stemBottom = new THREE.Vector3(1.3, -6.9, 0);
    const stemPoints = [];
    const stemRingCount = 4, stemPointsPerRing = 5;
    for (let r = 0; r < stemRingCount; r++) {
      const t = r / (stemRingCount - 1);
      const center = new THREE.Vector3().lerpVectors(stemTop, stemBottom, t);
      const radius = THREE.MathUtils.lerp(1.05, 0.45, t);
      for (let i = 0; i < stemPointsPerRing; i++) {
        const a2 = (i / stemPointsPerRing) * Math.PI * 2 + t * 0.7 + Math.random() * 0.3;
        stemPoints.push(new THREE.Vector3(
          center.x + Math.cos(a2) * radius,
          center.y + THREE.MathUtils.randFloatSpread(0.4),
          center.z + Math.sin(a2) * radius
        ));
      }
    }
    stemPoints.push(new THREE.Vector3(stemBottom.x - 0.2, stemBottom.y - 0.7, 0));
    const stemNodes = buildHullPart(stemPoints, (p) => {
      const node = new Node(p, THREE.MathUtils.randInt(3, 4), Math.random() < 0.35 ? 1 : 0);
      node.size = THREE.MathUtils.randFloat(0.4, 0.7);
      return node;
    });

    const foldNodes = [];
    const foldsPerSide = 4;
    for (const side of [1, -1]) {
      for (let f = 0; f < foldsPerSide; f++) {
        const yBase = 4.2 - f * 2.6;
        const xStart = -RX * (0.78 - f * 0.06);
        const xEnd = RX * (0.55 + f * 0.08);
        const steps = 9;
        const phase = Math.random() * Math.PI * 2;
        let prevNode = null;
        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          const x = THREE.MathUtils.lerp(xStart, xEnd, t);
          const y = yBase + Math.sin(t * Math.PI * 1.6 + phase) * 1.3 - t * 1.2;
          const inside = 1 - Math.pow(x / RX, 2) - Math.pow(y / RY, 2);
          if (inside < 0.03) { prevNode = null; continue; }
          const z = side * RZ * Math.sqrt(inside);
          const p = deformCerebrum(new THREE.Vector3(x, y, z * 1.02));
          const node = new Node(p, levelFromHeight(p.y), 0);
          node.size = THREE.MathUtils.randFloat(0.35, 0.6);
          node.distanceFromRoot = p.length();
          nodes.push(node);
          foldNodes.push(node);
          if (prevNode) prevNode.addConnection(node, THREE.MathUtils.randFloat(0.35, 0.55));
          prevNode = node;
        }
      }
    }
    for (const node of foldNodes) {
      if (Math.random() < 0.35) {
        let best = null, bestDist = Infinity;
        for (const cand of cerebrumNodes) {
          const d = node.position.distanceTo(cand.position);
          if (d < bestDist) { bestDist = d; best = cand; }
        }
        if (best && bestDist < 3) node.addConnection(best, 0.3);
      }
    }

    function bridge(fromNodes, toNodes, count, maxDist, strength) {
      const shuffled = fromNodes.slice().sort(() => Math.random() - 0.5);
      let made = 0;
      for (const node of shuffled) {
        if (made >= count) break;
        let best = null, bestDist = Infinity;
        for (const cand of toNodes) {
          const d = node.position.distanceTo(cand.position);
          if (d < bestDist) { bestDist = d; best = cand; }
        }
        if (best && bestDist < maxDist) {
          node.addConnection(best, strength);
          made++;
        }
      }
    }
    bridge(cerebellumNodes, cerebrumNodes, 12, 4.5, 0.55);
    bridge(stemNodes, cerebellumNodes, 6, 3.5, 0.55);
    bridge(stemNodes, cerebrumNodes, 5, 4.0, 0.55);

    const interiorCount = Math.max(10, Math.floor(25 * densityFactor));
    const interiorNodes = [];
    for (let i = 0; i < interiorCount; i++) {
      const dir = new THREE.Vector3(
        THREE.MathUtils.randFloatSpread(2),
        THREE.MathUtils.randFloatSpread(2),
        THREE.MathUtils.randFloatSpread(2)
      ).normalize();
      const rr = 0.2 + 0.6 * Math.random();
      const p = deformCerebrum(new THREE.Vector3(dir.x * RX, dir.y * RY, dir.z * RZ).multiplyScalar(rr));
      const node = new Node(p, THREE.MathUtils.randInt(1, 3), 1);
      node.size = THREE.MathUtils.randFloat(0.28, 0.55);
      node.distanceFromRoot = p.length();
      nodes.push(node);
      interiorNodes.push(node);
    }
    for (let i = 0; i < 3 && i < interiorNodes.length; i++) {
      rootNode.addConnection(interiorNodes[i], 0.2);
    }

    const ambientCount = Math.floor(80 * densityFactor);
    for (let i = 0; i < ambientCount; i++) {
      const dir = new THREE.Vector3(
        THREE.MathUtils.randFloatSpread(2),
        THREE.MathUtils.randFloatSpread(2),
        THREE.MathUtils.randFloatSpread(2)
      ).normalize();
      const f2 = THREE.MathUtils.randFloat(1.12, 1.75);
      const p = new THREE.Vector3(dir.x * RX, dir.y * RY, dir.z * RZ).multiplyScalar(f2);
      p.applyAxisAngle(Z_AXIS, TILT);
      const node = new Node(p, THREE.MathUtils.randInt(1, 3), 1);
      node.size = THREE.MathUtils.randFloat(0.22, 0.45);
      node.distanceFromRoot = p.length();
      nodes.push(node);
    }
    const sprayCount = Math.floor(18 * densityFactor);
    for (let i = 0; i < sprayCount; i++) {
      const p = cbCenter.clone().add(new THREE.Vector3(
        THREE.MathUtils.randFloat(1.5, 5.5),
        THREE.MathUtils.randFloat(-1.5, 3.0),
        THREE.MathUtils.randFloatSpread(5)
      ));
      const node = new Node(p, THREE.MathUtils.randInt(2, 4), 1);
      node.size = THREE.MathUtils.randFloat(0.2, 0.42);
      node.distanceFromRoot = p.length();
      nodes.push(node);
    }
    const trailCount = Math.floor(14 * densityFactor);
    for (let i = 0; i < trailCount; i++) {
      const t = Math.random();
      const p = new THREE.Vector3(
        stemBottom.x - 0.4 - t * 1.2 + THREE.MathUtils.randFloatSpread(1.6),
        stemBottom.y - 0.5 - t * 3.2,
        THREE.MathUtils.randFloatSpread(1.4)
      );
      const node = new Node(p, THREE.MathUtils.randInt(2, 4), 1);
      node.size = THREE.MathUtils.randFloat(0.2, 0.42);
      node.distanceFromRoot = p.length();
      nodes.push(node);
    }
  }

  generateBrainFormation();

  if (densityFactor < 1.0) {
    nodes = nodes.filter((node, index) => {
      if (node === rootNode) return true;
      const hash = (index * 31 + Math.floor(densityFactor * 100)) % 100;
      return hash < densityFactor * 100;
    });
    nodes.forEach((node) => {
      node.connections = node.connections.filter((conn) => nodes.includes(conn.node));
    });
  }

  return { nodes, rootNode, facetTriangles };
}

export default function BrainNetwork({ itemCount = 0, height = 480 }) {
  const containerRef = useRef(null);
  const stateRef = useRef(null);
  const [paused, setPaused] = useState(false);
  const [paletteIndex, setPaletteIndex] = useState(0);
  const [density, setDensity] = useState(100);

  // Cena montada uma única vez; tema/densidade/pausa atualizam via stateRef
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth || 600;
    const heightPx = container.clientHeight || height;

    const palettes = COLOR_PALETTES.map((p) => p.map((c) => new THREE.Color(c)));
    const config = { paused: false, activePaletteIndex: 0, densityFactor: 1 };

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(BACKGROUND_COLOR, 0.0012);

    const camera = new THREE.PerspectiveCamera(60, width / heightPx, 0.1, 1200);
    camera.position.set(0, 5, 22);

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setSize(width, heightPx);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(new THREE.Color(BACKGROUND_COLOR).convertSRGBToLinear());
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";
    renderer.domElement.style.cursor = "pointer";

    function createGlowSprite(rgb, alpha, scaleX, scaleY, position) {
      const size = 512;
      const glowCanvas = document.createElement("canvas");
      glowCanvas.width = glowCanvas.height = size;
      const ctx = glowCanvas.getContext("2d");
      const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      gradient.addColorStop(0, `rgba(${rgb}, ${alpha})`);
      gradient.addColorStop(0.4, `rgba(${rgb}, ${alpha * 0.45})`);
      gradient.addColorStop(0.75, `rgba(${rgb}, ${alpha * 0.15})`);
      gradient.addColorStop(1, `rgba(${rgb}, 0)`);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, size, size);
      const texture = new THREE.CanvasTexture(glowCanvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      const material = new THREE.SpriteMaterial({
        map: texture, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      });
      const sprite = new THREE.Sprite(material);
      sprite.scale.set(scaleX, scaleY, 1);
      sprite.position.copy(position);
      return sprite;
    }
    scene.add(createGlowSprite("45, 120, 235", 0.5, 55, 40, new THREE.Vector3(1, 18, -22)));
    scene.add(createGlowSprite("35, 90, 190", 0.22, 46, 38, new THREE.Vector3(0, 0, -26)));

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.rotateSpeed = 0.5;
    controls.minDistance = 5;
    controls.maxDistance = 100;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.15;
    controls.enablePan = false;

    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(width, heightPx), 0.7, 0.45, 0.7);
    composer.addPass(bloomPass);
    composer.addPass(new FilmPass(0.2, 0.3, 2048, false));
    composer.addPass(new OutputPass());

    const pulseUniforms = {
      uTime: { value: 0.0 },
      uPulsePositions: { value: [new THREE.Vector3(1e3, 1e3, 1e3), new THREE.Vector3(1e3, 1e3, 1e3), new THREE.Vector3(1e3, 1e3, 1e3)] },
      uPulseTimes: { value: [-1e3, -1e3, -1e3] },
      uPulseColors: { value: [new THREE.Color(1, 1, 1), new THREE.Color(1, 1, 1), new THREE.Color(1, 1, 1)] },
      uPulseSpeed: { value: 15.0 },
      uBaseNodeSize: { value: 0.42 },
      uActivePalette: { value: 0 },
    };

    let neuralNetwork = null, nodesMesh = null, connectionsMesh = null, facetsMesh = null;
    const segmentsPerConnection = 14;

    function randomFacetTint(palette) {
      const tint = palette[THREE.MathUtils.randInt(1, 3)].clone();
      const v = Math.random() < 0.08
        ? THREE.MathUtils.randFloat(0.07, 0.16)
        : THREE.MathUtils.randFloat(0.008, 0.04);
      return tint.multiplyScalar(v);
    }

    function disposeMeshes() {
      for (const mesh of [nodesMesh, connectionsMesh, facetsMesh]) {
        if (mesh) {
          scene.remove(mesh);
          mesh.geometry.dispose();
          mesh.material.dispose();
        }
      }
      nodesMesh = connectionsMesh = facetsMesh = null;
    }

    function createNetworkVisualization(densityFactor = 1.0) {
      disposeMeshes();
      neuralNetwork = generateNeuralNetwork(densityFactor);
      if (!neuralNetwork || neuralNetwork.nodes.length === 0) return;

      const nodesGeometry = new THREE.BufferGeometry();
      const nodePositions = [], nodeTypes = [], nodeSizes = [], nodeColors = [],
        connectionIndices = [], distancesFromRoot = [];

      neuralNetwork.nodes.forEach((node) => {
        nodePositions.push(node.position.x, node.position.y, node.position.z);
        nodeTypes.push(node.type);
        nodeSizes.push(node.size);
        distancesFromRoot.push(node.distanceFromRoot);
        const indices = node.connections.slice(0, 3).map((conn) => neuralNetwork.nodes.indexOf(conn.node));
        while (indices.length < 3) indices.push(-1);
        connectionIndices.push(...indices);
        const palette = palettes[config.activePaletteIndex];
        const colorIndex = Math.min(node.level, palette.length - 1);
        const baseColor = palette[colorIndex % palette.length].clone();
        baseColor.offsetHSL(
          THREE.MathUtils.randFloatSpread(0.05),
          THREE.MathUtils.randFloatSpread(0.1),
          THREE.MathUtils.randFloatSpread(0.1)
        );
        nodeColors.push(baseColor.r, baseColor.g, baseColor.b);
      });

      nodesGeometry.setAttribute("position", new THREE.Float32BufferAttribute(nodePositions, 3));
      nodesGeometry.setAttribute("nodeType", new THREE.Float32BufferAttribute(nodeTypes, 1));
      nodesGeometry.setAttribute("nodeSize", new THREE.Float32BufferAttribute(nodeSizes, 1));
      nodesGeometry.setAttribute("nodeColor", new THREE.Float32BufferAttribute(nodeColors, 3));
      nodesGeometry.setAttribute("connectionIndices", new THREE.Float32BufferAttribute(connectionIndices, 3));
      nodesGeometry.setAttribute("distanceFromRoot", new THREE.Float32BufferAttribute(distancesFromRoot, 1));

      const nodesMaterial = new THREE.ShaderMaterial({
        uniforms: THREE.UniformsUtils.clone(pulseUniforms),
        vertexShader: nodeShader.vertexShader,
        fragmentShader: nodeShader.fragmentShader,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      nodesMesh = new THREE.Points(nodesGeometry, nodesMaterial);
      scene.add(nodesMesh);

      const connectionsGeometry = new THREE.BufferGeometry();
      const connectionColors = [], connectionStrengths = [], connectionPositions = [],
        startPoints = [], endPoints = [], pathIndices = [];
      const processedConnections = new Set();
      let pathIndex = 0;

      neuralNetwork.nodes.forEach((node, nodeIndex) => {
        node.connections.forEach((connection) => {
          const connectedNode = connection.node;
          const connectedIndex = neuralNetwork.nodes.indexOf(connectedNode);
          if (connectedIndex === -1) return;
          const key = [Math.min(nodeIndex, connectedIndex), Math.max(nodeIndex, connectedIndex)].join("-");
          if (!processedConnections.has(key)) {
            processedConnections.add(key);
            const startPoint = node.position;
            const endPoint = connectedNode.position;
            const palette = palettes[config.activePaletteIndex];
            const avgLevel = Math.min(Math.floor((node.level + connectedNode.level) / 2), palette.length - 1);
            const baseColor = palette[avgLevel % palette.length].clone();
            baseColor.offsetHSL(
              THREE.MathUtils.randFloatSpread(0.05),
              THREE.MathUtils.randFloatSpread(0.1),
              THREE.MathUtils.randFloatSpread(0.1)
            );
            for (let i = 0; i < segmentsPerConnection; i++) {
              const tPair = [i / segmentsPerConnection, (i + 1) / segmentsPerConnection];
              for (const t of tPair) {
                connectionPositions.push(t, 0, 0);
                startPoints.push(startPoint.x, startPoint.y, startPoint.z);
                endPoints.push(endPoint.x, endPoint.y, endPoint.z);
                pathIndices.push(pathIndex);
                connectionStrengths.push(connection.strength);
                connectionColors.push(baseColor.r, baseColor.g, baseColor.b);
              }
            }
            pathIndex++;
          }
        });
      });

      connectionsGeometry.setAttribute("position", new THREE.Float32BufferAttribute(connectionPositions, 3));
      connectionsGeometry.setAttribute("startPoint", new THREE.Float32BufferAttribute(startPoints, 3));
      connectionsGeometry.setAttribute("endPoint", new THREE.Float32BufferAttribute(endPoints, 3));
      connectionsGeometry.setAttribute("connectionStrength", new THREE.Float32BufferAttribute(connectionStrengths, 1));
      connectionsGeometry.setAttribute("connectionColor", new THREE.Float32BufferAttribute(connectionColors, 3));
      connectionsGeometry.setAttribute("pathIndex", new THREE.Float32BufferAttribute(pathIndices, 1));

      const connectionsMaterial = new THREE.ShaderMaterial({
        uniforms: THREE.UniformsUtils.clone(pulseUniforms),
        vertexShader: connectionShader.vertexShader,
        fragmentShader: connectionShader.fragmentShader,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      connectionsMesh = new THREE.LineSegments(connectionsGeometry, connectionsMaterial);
      scene.add(connectionsMesh);

      if (neuralNetwork.facetTriangles.length > 0) {
        const facetGeometry = new THREE.BufferGeometry();
        facetGeometry.setAttribute("position", new THREE.Float32BufferAttribute(neuralNetwork.facetTriangles, 3));
        const facetColors = [];
        const palette = palettes[config.activePaletteIndex];
        const triCount = neuralNetwork.facetTriangles.length / 9;
        for (let i = 0; i < triCount; i++) {
          const tint = randomFacetTint(palette);
          for (let j = 0; j < 3; j++) facetColors.push(tint.r, tint.g, tint.b);
        }
        facetGeometry.setAttribute("color", new THREE.Float32BufferAttribute(facetColors, 3));
        const facetMaterial = new THREE.MeshBasicMaterial({
          vertexColors: true, transparent: true, blending: THREE.AdditiveBlending,
          depthWrite: false, side: THREE.DoubleSide,
        });
        facetsMesh = new THREE.Mesh(facetGeometry, facetMaterial);
        scene.add(facetsMesh);
      }

      const palette = palettes[config.activePaletteIndex];
      for (let i = 0; i < 3; i++) {
        connectionsMaterial.uniforms.uPulseColors.value[i].copy(palette[i]);
        nodesMaterial.uniforms.uPulseColors.value[i].copy(palette[i]);
      }
      nodesMaterial.uniforms.uActivePalette.value = config.activePaletteIndex;
    }

    function updateTheme(idx) {
      config.activePaletteIndex = idx;
      if (!nodesMesh || !connectionsMesh) return;
      const palette = palettes[idx];
      const nodeColorsAttr = nodesMesh.geometry.attributes.nodeColor;
      for (let i = 0; i < nodeColorsAttr.count; i++) {
        const node = neuralNetwork.nodes[i];
        if (!node) continue;
        const colorIndex = Math.min(node.level, palette.length - 1);
        const baseColor = palette[colorIndex % palette.length].clone();
        baseColor.offsetHSL(
          THREE.MathUtils.randFloatSpread(0.05),
          THREE.MathUtils.randFloatSpread(0.1),
          THREE.MathUtils.randFloatSpread(0.1)
        );
        nodeColorsAttr.setXYZ(i, baseColor.r, baseColor.g, baseColor.b);
      }
      nodeColorsAttr.needsUpdate = true;

      const connectionColors = [];
      const processedConnections = new Set();
      neuralNetwork.nodes.forEach((node, nodeIndex) => {
        node.connections.forEach((connection) => {
          const connectedIndex = neuralNetwork.nodes.indexOf(connection.node);
          if (connectedIndex === -1) return;
          const key = [Math.min(nodeIndex, connectedIndex), Math.max(nodeIndex, connectedIndex)].join("-");
          if (!processedConnections.has(key)) {
            processedConnections.add(key);
            const avgLevel = Math.min(Math.floor((node.level + connection.node.level) / 2), palette.length - 1);
            const baseColor = palette[avgLevel % palette.length].clone();
            baseColor.offsetHSL(
              THREE.MathUtils.randFloatSpread(0.05),
              THREE.MathUtils.randFloatSpread(0.1),
              THREE.MathUtils.randFloatSpread(0.1)
            );
            for (let i = 0; i < segmentsPerConnection * 2; i++) {
              connectionColors.push(baseColor.r, baseColor.g, baseColor.b);
            }
          }
        });
      });
      connectionsMesh.geometry.setAttribute("connectionColor", new THREE.Float32BufferAttribute(connectionColors, 3));
      connectionsMesh.geometry.attributes.connectionColor.needsUpdate = true;

      if (facetsMesh) {
        const facetColorAttr = facetsMesh.geometry.attributes.color;
        for (let i = 0; i < facetColorAttr.count; i += 3) {
          const tint = randomFacetTint(palette);
          for (let j = 0; j < 3; j++) facetColorAttr.setXYZ(i + j, tint.r, tint.g, tint.b);
        }
        facetColorAttr.needsUpdate = true;
      }

      nodesMesh.material.uniforms.uPulseColors.value.forEach((c, i) => c.copy(palette[i % palette.length]));
      connectionsMesh.material.uniforms.uPulseColors.value.forEach((c, i) => c.copy(palette[i % palette.length]));
      nodesMesh.material.uniforms.uActivePalette.value = idx;
    }

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const interactionPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const interactionPoint = new THREE.Vector3();
    let lastPulseIndex = 0;

    function triggerPulse(clientX, clientY) {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      interactionPlane.normal.copy(camera.position).normalize();
      interactionPlane.constant = -interactionPlane.normal.dot(camera.position) + camera.position.length() * 0.5;
      if (raycaster.ray.intersectPlane(interactionPlane, interactionPoint)) {
        const time = clock.getElapsedTime();
        if (nodesMesh && connectionsMesh) {
          lastPulseIndex = (lastPulseIndex + 1) % 3;
          nodesMesh.material.uniforms.uPulsePositions.value[lastPulseIndex].copy(interactionPoint);
          nodesMesh.material.uniforms.uPulseTimes.value[lastPulseIndex] = time;
          connectionsMesh.material.uniforms.uPulsePositions.value[lastPulseIndex].copy(interactionPoint);
          connectionsMesh.material.uniforms.uPulseTimes.value[lastPulseIndex] = time;
          const palette = palettes[config.activePaletteIndex];
          const randomColor = palette[Math.floor(Math.random() * palette.length)];
          nodesMesh.material.uniforms.uPulseColors.value[lastPulseIndex].copy(randomColor);
          connectionsMesh.material.uniforms.uPulseColors.value[lastPulseIndex].copy(randomColor);
        }
      }
    }

    const onClick = (e) => {
      if (!config.paused) triggerPulse(e.clientX, e.clientY);
    };
    const onTouchStart = (e) => {
      if (e.touches.length > 0 && !config.paused) {
        triggerPulse(e.touches[0].clientX, e.touches[0].clientY);
      }
    };
    renderer.domElement.addEventListener("click", onClick);
    renderer.domElement.addEventListener("touchstart", onTouchStart, { passive: true });

    const clock = new THREE.Clock();
    let raf;
    function animate() {
      raf = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();
      if (!config.paused) {
        const sway = Math.sin(t * 0.05) * 0.08;
        if (nodesMesh) {
          nodesMesh.material.uniforms.uTime.value = t;
          nodesMesh.rotation.y = sway;
        }
        if (connectionsMesh) {
          connectionsMesh.material.uniforms.uTime.value = t;
          connectionsMesh.rotation.y = sway;
        }
        if (facetsMesh) facetsMesh.rotation.y = sway;
      }
      controls.update();
      composer.render();
    }

    function onResize() {
      const w = container.clientWidth || width;
      const h = container.clientHeight || heightPx;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      composer.setSize(w, h);
      bloomPass.resolution.set(w, h);
    }
    const resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(container);

    createNetworkVisualization(config.densityFactor);
    updateTheme(config.activePaletteIndex);
    animate();

    let densityTimeout;
    stateRef.current = {
      setPaused(v) {
        config.paused = v;
        controls.autoRotate = !v;
      },
      setPalette(idx) {
        updateTheme(idx);
      },
      setDensity(pct) {
        config.densityFactor = pct / 100;
        clearTimeout(densityTimeout);
        densityTimeout = setTimeout(() => {
          createNetworkVisualization(config.densityFactor);
          updateTheme(config.activePaletteIndex);
        }, 300);
      },
      resetCamera() {
        controls.reset();
        controls.autoRotate = false;
        setTimeout(() => { controls.autoRotate = !config.paused; }, 1500);
      },
    };

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(densityTimeout);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener("click", onClick);
      renderer.domElement.removeEventListener("touchstart", onTouchStart);
      controls.dispose();
      disposeMeshes();
      composer.dispose?.();
      renderer.dispose();
      container.removeChild(renderer.domElement);
      stateRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { stateRef.current?.setPaused(paused); }, [paused]);
  useEffect(() => { stateRef.current?.setPalette(paletteIndex); }, [paletteIndex]);
  useEffect(() => { stateRef.current?.setDensity(density); }, [density]);

  return (
    <div className="relative w-full overflow-hidden rounded-2xl" style={{ height, background: "#051228" }}>
      <div ref={containerRef} className="absolute inset-0" />

      {/* Painel de temas + densidade */}
      <div className="absolute top-3 right-3 z-10 rounded-xl border border-sky-400/30 bg-[#030a1a]/70 backdrop-blur-md p-3 flex flex-col gap-2.5"
        style={{ maxWidth: 140 }}>
        <div className="grid grid-cols-4 gap-1.5">
          {THEME_SWATCHES.map((bg, i) => (
            <button
              key={i}
              aria-label={`Tema ${i + 1}`}
              onClick={() => setPaletteIndex(i)}
              className={`w-6 h-6 rounded-md border-2 transition-transform hover:scale-105 ${
                paletteIndex === i ? "border-white/90 shadow-[0_0_10px_rgba(110,215,255,.6)]" : "border-white/30"
              }`}
              style={{ background: bg }}
            />
          ))}
        </div>
        <div>
          <div className="flex justify-between text-[10px] text-sky-100/80 mb-1">
            <span>Densidade</span><span>{density}%</span>
          </div>
          <input
            type="range" min="20" max="100" value={density}
            onChange={(e) => setDensity(parseInt(e.target.value, 10))}
            className="w-full h-1 accent-sky-300 cursor-pointer"
            aria-label="Densidade da rede"
          />
        </div>
      </div>

      {/* Controles */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 flex gap-2 rounded-xl border border-sky-400/20 bg-[#030a1a]/60 px-3 py-2">
        <button
          onClick={() => setPaused((p) => !p)}
          className="px-3 py-1 rounded-md text-xs font-semibold text-sky-50 bg-sky-500/20 border border-sky-400/30 hover:bg-sky-500/40 transition-colors"
        >
          {paused ? "Rodar" : "Pausar"}
        </button>
        <button
          onClick={() => stateRef.current?.resetCamera()}
          className="px-3 py-1 rounded-md text-xs font-semibold text-sky-50 bg-sky-500/20 border border-sky-400/30 hover:bg-sky-500/40 transition-colors"
        >
          Resetar câmera
        </button>
      </div>

      <div className="absolute bottom-3 right-3 z-10 text-[10px] font-mono text-sky-200/60">
        {itemCount} memórias · arraste para girar · clique para pulsar
      </div>
    </div>
  );
}
