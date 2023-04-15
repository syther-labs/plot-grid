import Grid from '../src';
import './index.css';
let context = document.querySelector('.context');
const frame = context.appendChild(document.createElement('div'));
frame.className = 'frame';
window.grid = new Grid({
  'container' : frame,
  minZoom:0.0001,
  maxZoom:10000,
  // gl: true,
});