/**
 * Table-soccer rods and figures, shared by the foosball mini-game and the bar's own table.
 * The table is 0.7 m across (z); a rod's handle sits 0.3 m outside the wall on its owner's side.
 */
import * as THREE from 'three';
import { reskin } from './reskin.js';

const W = 0.7;
/** The handle's centre, along the rod from the table's centre line (sign: the owner's side). */
export const FOOS_HANDLE_Z = W / 2 + 0.3;

/** Materials shared by the foosball rods and figures. */
export function foosMaterials() {
  return {
    rodMat: new THREE.MeshStandardMaterial({ color: 0xbbbbbb, metalness: 0.9, roughness: 0.3 }),
    youMat: new THREE.MeshStandardMaterial({ color: 0x2b5fd9, roughness: 0.5 }),
    botMat: new THREE.MeshStandardMaterial({ color: 0xd93b2b, roughness: 0.5 }),
    handleMat: new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 }),
    skinMat: new THREE.MeshStandardMaterial({ color: 0xf1c9a5 }),
  };
}

/**
 * One foosball figure. Origin = where the rod passes through the chest; the feet hang 7cm below.
 * Reskin: a cavalry trooper for the player, an outlaw for the opponent (same origin and size).
 */
export function makeFoosFigure(teamMat, mats) {
  const glb = reskin.model(teamMat === mats.youMat ? 'foosball-figure-cavalry.glb' : 'foosball-figure-outlaw.glb');
  if (glb) return glb;
  const m = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.045, 0.026), teamMat);
  body.position.y = -0.03;
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.03, 0.02), mats.handleMat);
  legs.position.y = -0.062;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.011, 8, 6), mats.skinMat);
  head.position.y = 0.0;
  m.add(body, legs, head);
  return m;
}

/**
 * One rod: steel bar, rubber handle on its owner's side, and a figure at each offset.
 * The group's origin is the rod axis at the table's centre line; z runs across the table.
 */
export function makeFoosRod(team, offsets, mats) {
  const group = new THREE.Group();
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, W + 0.36, 8), mats.rodMat);
  rod.rotation.x = Math.PI / 2; rod.position.z = team === 'you' ? 0.18 : -0.18; group.add(rod);
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.1, 10), mats.handleMat);
  handle.rotation.x = Math.PI / 2; handle.position.z = team === 'you' ? W / 2 + 0.3 : -(W / 2 + 0.3); group.add(handle);
  const menGroup = new THREE.Group(); group.add(menGroup);
  const men = [];
  for (const off of offsets) {
    const m = makeFoosFigure(team === 'you' ? mats.youMat : mats.botMat, mats);
    m.position.z = off;
    menGroup.add(m); men.push(m);
  }
  // reskin: the modelled rod replaces the steel bar and black handle, handle on its owner's side
  const rodModel = reskin.model('foosball-rod.glb');
  if (rodModel) {
    rod.visible = false; handle.visible = false;
    rodModel.position.z = team === 'you' ? 0.18 : -0.18;
    rodModel.rotation.y = team === 'you' ? 0 : Math.PI;
    group.add(rodModel);
  }
  return { group, rod, handle, menGroup, men, rodModel };
}
