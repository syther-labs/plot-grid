import { GlGrid } from "./GlGrid";
import { Canvas2DGrid } from "./Canvas2DGrid";

export default class Grid {
  constructor(options) {
    if(options.gl) {
      return new GlGrid(options);
    }
    return new Canvas2DGrid(options);
  }
};