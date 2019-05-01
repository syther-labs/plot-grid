import GlGrid from "./gl";
import Canvas2DGrid from "./2d";

class Grid {
  constructor(options) {
    if(options.gl) {
      return new GlGrid(options);
    }
    return new Canvas2DGrid(options);
  }
}

export default Grid;