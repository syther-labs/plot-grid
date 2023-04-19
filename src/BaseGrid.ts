/**
 * Abstract plot-grid class, with no specific renderer
 *
 * @module  plot-grid/src/core
 */

import createLoop from 'canvas-loop';
import alpha from 'color-alpha';
import Emitter from 'events';
import getContext from 'gl-util/context';
import panzoom from './panzoom';
import { clamp, parseUnit, toPx, isObj } from './mumath';
import types, { AxisScaling, LinearScaling } from './types';

export type AxisState = {
  opposite?: any;
  offset: number;
  scale?: any;
  axisColor?: any;
  axisWidth?: any;
  lineWidth?: any;
  tickAlign?: any;
  labelColor?: any;
  color?: any;
  padding?: number[];
  step?: number;
  fontSize?: any;
  fontFamily?: any;
  lines?: any;
  lineColors?: any;
  ticks?: any;
  labels?: any;
  range: number;
  shape: any;
  coordinate: BaseCoordinate;
  grid: BaseGrid
}

type GridState = {
  y?: AxisState;
  x?: AxisState
}

type GridOptions = {
  context?: string;
  container?: HTMLElement;
  width?: any;
  height?: any;
  gl?: boolean,
  r?: boolean;
  a?: boolean;
  x?: boolean;
  y?: boolean;
};

type AxisUpdate = {
  disabled?: boolean;
  scale?: number;
  type?: ""
  offset?: number;
}

type UpdateParams = {
  r?: boolean | AxisUpdate;
  a?: boolean | AxisUpdate;
  x?: boolean | AxisUpdate;
  y?: boolean | AxisUpdate;
}

//constructor
export class BaseGrid extends Emitter {
  types: { //stub methods
    //return coords for the values, redefined by axes
    linear: { steps: number[]; distance: number; lines: (state: any) => any[]; lineColor: (state: any) => any; ticks: (state: any) => any; labels: (state: any) => any; }; logarithmic: {
      scale: number; offset: number; distance: number; lines: (state: any) => any[]; lineColor: (state: any) =>
        //constructor
        any; ticks: (state: any) => any; labels: (state: any) => any; isMajorLine: (v: any, state: any) => boolean; isLabel: (v: any, state: any) => boolean;
    }; time: { lines: boolean; ticks: (state: any) => {}; labels: (state: any) => {}; };
  };
  state: GridState;
  canvas: HTMLCanvasElement;
  container: any;
  context: any;
  x: any;
  y: YCoordinate;
  r: any;
  a: any;
  loop: any;
  pixelRatio: any;
  render: any;
  autostart: any;
  interactions: any;
  scale: number;
  minZoom: number;
  maxZoom: number;

  defaults: {
    type: string; name: string; units: string;
    //visible range params
    minZoom: number; maxZoom: number; min: number; max: number; offset: number; origin: number; scale: number; minScale: number; maxScale: number; zoom: boolean; pan: boolean;
    //labels
    labels: boolean; fontSize: string; fontFamily: string; padding: number; color: string;
    //lines params
    lines: boolean; tick: number; tickAlign: number; lineWidth: number; distance: number; style: string; lineColor: number;
    //axis params
    axis: boolean; axisOrigin: number; axisWidth: number; axisColor: number;
    //stub methods
    //return coords for the values, redefined by axes
    getCoords: (values: any, state: any) => number[];
    //return 0..1 ratio based on value/offset/range, redefined by axes
    getRatio: (value: any, state: any) => 0;
    //default label formatter
    format: (v: any) => any;
  } & { steps: number[]; distance: number; lines: (state: any) => any[]; lineColor: (state: any) => any; ticks: (state: any) => any; labels: (state: any) => any; };

  constructor(opts: GridOptions) {
    super(opts as any);
    this.types = types;
    //create rendering state
    this.state = {};
    Object.assign(this, opts);
    //create canvas/container
    //FIXME: this is not very good for 2d case though
    // if (opts.context == '2d') {
    // this.context = this.can
    if (!this.canvas) {
      this.canvas = document.createElement('canvas');
    }
    this.container = opts.container || document.body;

    this.canvas.width = opts.width || this.container.clientWidth;
    this.canvas.height = opts.height || this.container.clientHeight;
    console.log(this.canvas.width);
    this.context = this.canvas.getContext(opts.gl ? 'webgl' : '2d');
    // }
    if (!this.context) this.context = getContext(this);
    if (!this.canvas) this.canvas = this.context.canvas;
    if (!this.container) this.container = document.body || document.documentElement;
    if (!this.canvas.parentNode) {
      this.container.appendChild(this.canvas);
    }
    this.canvas.classList.add('plot-grid-canvas');

    this.setDefaults();

    //create x/y/r
    // this.x = Object.assign({ disabled: true }, this.x, opts.x);
    this.x = new XCoordinate({ disabled: true, });
    this.y = new YCoordinate({ disabled: true, });
    this.r = new XCoordinate({ disabled: true, });
    this.a = new YCoordinate({ disabled: true, });

    // this.r = Object.assign({ disabled: true }, this.r, opts.r);
    // this.a = Object.assign({ disabled: true }, this.a, opts.a);
    //enable proper lines
    if (opts.x !== undefined)
      this.x.disabled = !opts.x;
    if (opts.y !== undefined)
      this.y.disabled = !opts.y;
    if (opts.r !== undefined)
      this.r.disabled = !opts.r;
    if (opts.a !== undefined)
      this.a.disabled = !opts.a;
    //create loop
    this.loop = createLoop(this.canvas, { parent: this.container, scale: this.pixelRatio });
    this.loop.on('tick', () => {
      this.render && this.render();
    });
    this.loop.on('resize', () => {
      this.update && this.update();
    });
    this.autostart && this.loop.start();

    //enable interactions
    panzoom(this.canvas, (e) => {
      if (!this.interactions) return;
      let { width, height } = this.canvas;
      //shift start
      let zoom = clamp(-e.dz, -height * .75, height * .75) / height;

      let prevScale = this.x.scale;
      this.scale = prevScale * (1 - zoom);
      this.scale = clamp(this.scale, this.minZoom, this.maxZoom);

      let x = { offset: this.x.offset } as AxisUpdate;
      let y = { offset: this.y.offset } as AxisUpdate;
      //pan
      if (!this.x.disabled) {
        let oX = this.x && this.x.origin || 0;
        if (this.x.pan) {
          x.offset! -= prevScale * e.dx;
        }
        if (this.x.zoom !== false) {
          let tx = (e.x) / width - oX;
          x.offset! -= width * (this.scale - prevScale) * tx;
        }
      }
      if (!this.y.disabled) {
        let oY = this.y && this.y.origin || 0;
        if (this.y.pan) {
          y.offset! += prevScale * e.dy;
        }
        if (this.y.zoom !== false) {
          let ty = oY - (e.y) / height;
          y.offset! -= height * (this.scale - prevScale) * ty;
        }
      }
      x.scale = this.scale;
      y.scale = this.scale;
      // console.log(x)
      this.update({ x, y });
      this.emit('interact', this);
    });

    this.emit('ready', this);
  }

  //re-evaluate lines, calc options for renderer
  update(opts: UpdateParams = {}) {
    const shape = [this.canvas.width, this.canvas.height] as const;
    if (opts) {
      //treat bools
      if (opts.x === false || opts.x === true)
        opts.x = { disabled: !opts.x };
      if (opts.y === false || opts.y === true)
        opts.y = { disabled: !opts.y };
      if (opts.r === false || opts.r === true)
        opts.r = { disabled: !opts.r };
      if (opts.a === false || opts.a === true)
        opts.a = { disabled: !opts.a };
      //take over types properties
      if (opts.x && opts.x.type)
        opts.x = Object.assign({}, this.types[opts.x.type], opts.x);
      if (opts.y && opts.y.type)
        opts.y = Object.assign({}, this.types[opts.y.type], opts.y);
      if (opts.r && opts.r.type)
        opts.r = Object.assign({}, this.types[opts.r.type], opts.r);
      if (opts.a && opts.a.type)
        opts.a = Object.assign({}, this.types[opts.a.type], opts.a);
      //Object.assign props
      if (opts.x)
        Object.assign(this.x, opts.x);
      if (opts.y)
        Object.assign(this.y, opts.y);
      if (opts.r)
        Object.assign(this.r, opts.r);
      if (opts.a)
        Object.assign(this.a, opts.a);
    }
    //normalize, make sure range/offset are not off the limits
    if (!this.x.disabled) {
      let range = this.x.getRange({ shape: shape, coordinate: this.x });
      this.x.offset = clamp(this.x.offset, this.x.min, Math.max(this.x.max - range, this.x.min));
      // this.x.maxScale = (this.x.max - this.x.min) / shape[0];
    }
    if (!this.y.disabled) {
      let range = this.y.getRange({ shape: shape, coordinate: this.y });
      this.y.offset = clamp(this.y.offset, this.y.min, Math.max(this.y.max - range, this.y.min));
      // this.y.maxScale = (this.y.max - this.y.min) / shape[1];
    }
    //recalc state
    this.state.x = this.calcCoordinate(this.x, shape);
    this.state.y = this.calcCoordinate(this.y, shape);
    console.log(`x: ${this.state.x.offset}, y: ${this.state.y.offset}`)
    // console.log(`scale: ${this.state.x.scale}, y: ${this.state.y.scale}`)
    this.state.x.opposite = this.state.y;
    this.state.y.opposite = this.state.x;
    this.emit('update', opts);
    return this;
  }
  //get state object with calculated params, ready for rendering
  calcCoordinate(coord: BaseCoordinate, shape: readonly [x: number, y: number]): AxisState {
    let state: AxisState = {
      coordinate: coord,
      shape: shape,
      grid: this,
      offset: 0,
      range: 0
    };
    //calculate real offset/range
    state.range = coord.getRange(state);
    state.offset = clamp(coord.offset - state.range! * clamp(coord.origin, 0, 1), Math.max(coord.min, -Number.MAX_VALUE + 1), Math.min(coord.max, Number.MAX_VALUE) - state.range!);
    state.scale = coord.scale;
    //calc style
    state.axisColor = typeof coord.axisColor === 'number' ? alpha(coord.color, coord.axisColor) : coord.axisColor || coord.color;
    state.axisWidth = coord.axisWidth || coord.lineWidth;
    state.lineWidth = coord.lineWidth;
    state.tickAlign = coord.tickAlign;
    state.labelColor = state.color;
    //get padding
    if (typeof coord.padding === 'number') {
      state.padding = Array(4).fill(coord.padding);
    }
    else if (coord.padding instanceof Function) {
      state.padding = coord.padding(state);
    }
    else {
      state.padding = coord.padding;
    }
    //calc font
    if (typeof coord.fontSize === 'number') {
      state.fontSize = coord.fontSize;
    }
    else {
      let units = parseUnit(coord.fontSize);
      state.fontSize = units[0] * toPx(units[1]);
    }
    state.fontFamily = coord.fontFamily || 'sans-serif';
    //get lines stops, including joined list of values
    let lines;
    if (coord.lines instanceof Function) {
      lines = coord.lines(state);
    }
    else {
      lines = coord.lines || [];
    }
    state.lines = lines;
    //calc colors
    if (coord.lineColor instanceof Function) {
      state.lineColors = coord.lineColor(state);
    }
    else if (Array.isArray(coord.lineColor)) {
      state.lineColors = coord.lineColor;
    }
    else {
      let color = typeof coord.lineColor === 'number' ? alpha(coord.color, coord.lineColor) : (coord.lineColor === false || coord.lineColor == null) ? null : coord.color;
      state.lineColors = Array(lines.length).fill(color);
    }
    //calc ticks
    state.ticks = coord.scaling.ticks(state);
    //calc labels
    state.labels = coord.scaling.labels(state);

    // //convert hashmap ticks/labels to lines + colors
    // if (isObj(ticks)) {
    //   state.ticks = Array(lines.length).fill(0);
    // }
    // if (isObj(labels)) {
    //   state.labels = Array(lines.length).fill(null);
    // }
    // if (isObj(ticks)) {
    //   for (let value in ticks) {
    //     state.ticks.push(ticks[value]);
    //     state.lines.push(parseFloat(value));
    //     state.lineColors.push(null);
    //     state.labels.push(null);
    //   }
    // }
    // if (isObj(labels)) {
    //   for (let value in labels) {
    //     state.labels.push(labels[value]);
    //     state.lines.push(parseFloat(value));
    //     state.lineColors.push(null);
    //     state.ticks.push(null);
    //   }
    // }
    return state;
  }

  setDefaults() {
    this.pixelRatio = 1;
    this.autostart = true;
    this.interactions = true;

    this.defaults = Object.assign({
      type: 'linear',
      name: '',
      units: '',

      //visible range params
      minZoom: 0.01,
      maxZoom: 10,
      min: -Infinity,
      max: Infinity,
      offset: 0,
      origin: .5,
      scale: 1,
      minScale: 1.19209290e-13,
      maxScale: Number.MAX_VALUE || 1e100,
      zoom: true,
      pan: true,

      //labels
      labels: true,
      fontSize: '11pt',
      fontFamily: 'sans-serif',
      padding: 0,
      color: 'rgb(0,0,0,1)',

      //lines params
      lines: true,
      tick: 8,
      tickAlign: .5,
      lineWidth: 1,
      distance: 13,
      style: 'lines',
      lineColor: .4,

      //axis params
      axis: true,
      axisOrigin: 0,
      axisWidth: 1.5,
      axisColor: 0.8,

      //stub methods
      //return coords for the values, redefined by axes
      getCoords: (values, state) => [0, 0, 0, 0],

      //return 0..1 ratio based on value/offset/range, redefined by axes
      getRatio: (value, state) => 0,

      //default label formatter
      format: v => v
    }, types.linear);

    this.x = Object.assign({}, this.defaults, {
      orientation: 'x',
      getCoords: (values, state) => {
        let coords = [] as number[];
        if (!values) return coords;
        for (let i = 0; i < values.length; i++) {
          let t = state.coordinate.getRatio(values[i], state);
          coords.push(t);
          coords.push(0);
          coords.push(t);
          coords.push(1);
        }
        return coords;
      },
      getRange: state => {
        return state.shape[0] * state.coordinate.scale;
      },
      //FIXME: handle infinity case here
      getRatio: (value, state) => {
        return (value - state.offset) / state.range
      }
    });
    this.y = new YCoordinate({});
    this.r = Object.assign({}, this.defaults, {
      orientation: 'r'
    });
    this.a = Object.assign({}, this.defaults, {
      orientation: 'a'
    });
  }
}


type CoordinateOption = {
  disabled?: boolean;
  type?: 'linear' | 'logarithmic';
  name?: string;
  units?: string;

  //visible range params
  minZoom?: number;
  maxZoom?: number;
  min?: number;
  max?: number;
  offset?: number;
  origin?: number;
  scale?: number;
  steps?: number[];
  minScale?: number;
  maxScale?: number;
  zoom?: boolean;
  pan?: boolean;

  //labels
  labels?: boolean;
  fontSize?: string;
  fontFamily?: string;
  padding?: number;
  color?: string;

  //lines params
  lines?: boolean;
  tick?: number;
  tickAlign?: number;
  lineWidth?: number;
  distance?: number;
  style?: string;
  lineColor?: number;

  //axis params
  axis?: boolean;
  axisOrigin?: number;
  axisWidth?: number;
  axisColor?: number;
}

abstract class BaseCoordinate {
  disabled: boolean = false;
  type: 'linear' | 'logarithmic' = 'linear';
  name: string = '';
  units: string = '';
  steps?: number[];
  scaling: AxisScaling;

  //visible range params
  minZoom: number = 0.01;
  maxZoom: number = 10;
  min: number = -Infinity;
  max: number = Infinity;
  offset: number = 0;
  origin: number = .5;
  scale: number = 1;
  minScale: number = 1.19209290e-13;
  maxScale: number = Number.MAX_VALUE || 1e100;
  zoom: boolean = true;
  pan: boolean = true;

  //labels
  labels: boolean = true;
  fontSize: string = '11pt';
  fontFamily: string = 'sans-serif';
  padding: number | ((state: AxisState) => number[]) = 0;
  color: string = 'rgb(0,0,0,1)';

  //lines params
  lines: boolean | ((state: AxisState) => boolean[]) = true;
  tick: number = 8;
  tickAlign: number = .5;
  lineWidth: number = 1;
  distance: number = 13;
  style: string = 'lines';
  lineColor: number | ((state: AxisState) => string[]) = .4;

  //axis params
  axis: boolean = true;
  axisOrigin: number = 0;
  axisWidth: number = 1.5;
  axisColor: number = 0.8;

  constructor(opts: CoordinateOption) {
    if (opts.disabled) this.disabled = opts.disabled;
    if (opts.type) this.type = opts.type;
    if (opts.name) this.name = opts.name;
    if (opts.units) this.units = opts.units;

    //visible range params
    if (opts.minZoom) this.minZoom = opts.minZoom;
    if (opts.maxZoom) this.maxZoom = opts.maxZoom;
    if (opts.min) this.min = opts.min;
    if (opts.max) this.max = opts.max;
    if (opts.offset) this.offset = opts.offset;
    if (opts.origin) this.origin = opts.origin;
    if (opts.scale) this.scale = opts.scale;
    if (opts.minScale) this.minScale = opts.minScale;
    if (opts.maxScale) this.maxScale = opts.maxScale;
    if (opts.zoom) this.zoom = opts.zoom;
    if (opts.pan) this.pan = opts.pan;

    //labels
    if (opts.labels) this.labels = opts.labels;
    if (opts.fontSize) this.fontSize = opts.fontSize;
    if (opts.fontFamily) this.fontFamily = opts.fontFamily;
    if (opts.padding) this.padding = opts.padding;
    if (opts.color) this.color = opts.color;

    //lines params
    if (opts.lines) this.lines = opts.lines;
    if (opts.tick) this.tick = opts.tick;
    if (opts.tickAlign) this.tickAlign = opts.tickAlign;
    if (opts.lineWidth) this.lineWidth = opts.lineWidth;
    if (opts.distance) this.distance = opts.distance;
    if (opts.style) this.style = opts.style;
    if (opts.lineColor) this.lineColor = opts.lineColor;

    //axis params
    if (opts.axis) this.axis = opts.axis;
    if (opts.axisOrigin) this.axisOrigin = opts.axisOrigin;
    if (opts.axisWidth) this.axisWidth = opts.axisWidth;
    if (opts.axisColor) this.axisColor = opts.axisColor;
  }

  abstract getRange(state: AxisState): number;

  getCoords(values: number[], state: AxisState) {
    return [0, 0, 0, 0]
  }

  getRatio(value: number, state: AxisState) {
    return 0;
  }

  format(v: number) {
    return v
  }
}

class XCoordinate extends BaseCoordinate {
  scaling: AxisScaling = new LinearScaling();
  orientation: 'x';
  getCoords(values, state) {
    let coords = [] as number[];
    if (!values) return coords;
    for (let i = 0; i < values.length; i++) {
      let t = state.coordinate.getRatio(values[i], state);
      coords.push(t);
      coords.push(0);
      coords.push(t);
      coords.push(1);
    }
    return coords;
  }

  getRange(state) {
    return state.shape[0] * state.coordinate.scale;
  }
  //FIXME: handle infinity case here

  getRatio(value, state) {
    return (value - state.offset) / state.range
  }
}

class YCoordinate extends BaseCoordinate {
  orientation: 'y';

  constructor(opts: CoordinateOption) {
    super(opts)
  }

  getCoords(values, state) {
    let coords = [] as number[];
    if (!values) return coords;
    for (let i = 0; i < values.length; i++) {
      let t = state.coordinate.getRatio(values[i], state);
      coords.push(0);
      coords.push(t);
      coords.push(1);
      coords.push(t);
    }
    return coords;
  }

  getRange(state) {
    return state.shape[1] * state.coordinate.scale;
  }

  getRatio(value, state) {
    return 1 - (value - state.offset) / state.range
  }
}