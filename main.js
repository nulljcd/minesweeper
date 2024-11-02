class BufferedImage {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.data = new Uint8Array(this.width * this.height * 3);
  }

  get(x, y) {
    if (x >= 0 && y >= 0 && x < this.width && y < this.height)
      return this.data.slice((x + y * this.width) * 3, (x + y * this.width) * 3 + 3);
    else
      return new Uint8Array(3);
  }

  set(x, y, data) {
    if (x >= 0 && y >= 0 && x < this.width && y < this.height)
      for (let i = 0; i < 3; i++)
        this.data[(x + y * this.width) * 3 + i] = data[i];
  }
}

class ImageLoader {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');
  }

  async load(sources) {
    let self = this;

    return new Promise(function (resolve, reject) {
      let bufferedImages = new Array(sources.length);
      for (let i = 0; i < sources.length; i++) {
        let source = sources[i];
        let image = new Image();
        image.crossOrigin = "anonymous";
        image.onload = () => {
          let width = image.width;
          let height = image.height;
          self.canvas.width = width;
          self.canvas.height = height;
          self.ctx.drawImage(image, 0, 0);
          try {
            let canvasImageData = self.ctx.getImageData(0, 0, width, height).data;
            let bufferedImage = new BufferedImage(width, height);
            for (let i = 0; i < width * height * 3; i++)
              bufferedImage.data[i] = canvasImageData[i + Math.floor(i / 3)];
            bufferedImages[i] = bufferedImage;
            if (i == sources.length - 1)
              resolve(bufferedImages);
          } catch {
            reject();
          }
        }
        image.onerror = () => {
          reject();
        }
        image.src = source;
      }
    });
  }
}

class Display {
  constructor(canvas, resolutionX, resolutionY, scale) {
    this.canvas = canvas;
    this.scale = scale;

    this.canvas.style.cssText = `
      display: block;
      image-rendering: optimizeSpeed;
      image-rendering: -moz-crisp-edges;
      image-rendering: -webkit-optimize-contrast;
      image-rendering: optimize-contrast;
      image-rendering: pixelated;
      -ms-interpolation-mode: nearest-neighbor;`;
    this.resolutionX = resolutionX;
    this.resolutionY = resolutionY;
    this.ctx = this.canvas.getContext("2d");
    this.canvas.width = this.resolutionX;
    this.canvas.height = this.resolutionY;
    this.canvas.style.width = `${this.resolutionX * this.scale}px`;
    this.canvas.style.height = `${this.resolutionY * this.scale}px`;
    this.canvasImageData = this.ctx.getImageData(0, 0, this.resolutionX, this.resolutionY);
  }

  setScale(scale) {
    this.scale = scale;
    this.canvas.style.width = `${this.resolutionX * this.scale}px`;
    this.canvas.style.height = `${this.resolutionY * this.scale}px`;
  }

  draw(buffer) {
    this.ctx.imageSmoothingEnabled = false;
    for (let y = 0; y < this.resolutionY; y++) {
      for (let x = 0; x < this.resolutionX; x++) {
        let color = buffer.get(x, y);
        let pixelIndex = (x + y * this.resolutionX) * 4;
        for (let i = 0; i < 3; i++)
          this.canvasImageData.data[pixelIndex + i] = color[i];
        this.canvasImageData.data[pixelIndex + 3] = 255;
      }
      this.ctx.putImageData(this.canvasImageData, 0, 0);
    }
  }
}



let state = 0;
let mapWidth = 10;
let mapHeight = 8;
let tileSize = 8;
let numMines = 10;

let tileData = new Uint8Array(mapWidth * mapHeight);
let mineData = new Uint8Array(mapWidth * mapHeight);
let openData = new Uint8Array(mapWidth * mapHeight);
let flagData = new Uint8Array(mapWidth * mapHeight);
let countData = new Uint8Array(mapWidth * mapHeight);

let topBar = document.querySelector("#topBar");
let displayContainer = document.querySelector("#displayContainer");
let canvas = document.querySelector('#display');
let displayWidth = mapWidth * tileSize;
let displayHeight = mapHeight * tileSize;
let buffer = new BufferedImage(displayWidth, displayHeight);
let display = new Display(canvas, displayWidth, displayHeight, 1);
display.setScale(Math.min(displayContainer.clientWidth / canvas.width, displayContainer.clientHeight / canvas.height) * 0.9);
window.onresize = () => display.setScale(Math.min(displayContainer.clientWidth / canvas.width, displayContainer.clientHeight / canvas.height) * 0.9);
let spriteSheet = null;
let imageLoader = new ImageLoader();
imageLoader.load([
  "spriteSheet.png"
]).then(bufferedImages => {
  spriteSheet = bufferedImages[0];
  step(0, 0, 0);
});
document.addEventListener('contextmenu', event => event.preventDefault());



function resetData() {
  tileData.fill(11);
  mineData.fill(0);
  openData.fill(0);
  flagData.fill(0);
  countData.fill(0);
}

function createMap(tileX, tileY) {
  for (let i = 0; i < numMines; i++)
    while (true) {
      let mineX = Math.floor(Math.random() * mapWidth);
      let mineY = Math.floor(Math.random() * mapHeight);
      if (mineData[mineX + mineY * mapWidth] == 0 && ((mineX < tileX - 1 || mineX > tileX + 1) || (mineY < tileY - 1 || mineY > tileY + 1))) {
        mineData[mineX + mineY * mapWidth] = 1;
        break;
      }
    }
  for (let tileY = 0; tileY < mapHeight; tileY++)
    for (let tileX = 0; tileX < mapWidth; tileX++)
      if (mineData[tileX + tileY * mapWidth] == 0) {
        let count = 0;
        for (let j = -1; j < 2; j++)
          for (let i = -1; i < 2; i++)
            if ((tileX + j) >= 0 && (tileX + j) < mapWidth && (tileY + i) >= 0 && (tileY + i) < mapHeight)
              count += mineData[(tileX + j) + (tileY + i) * mapWidth];
        countData[tileX + tileY * mapWidth] = count;
      }
}

function zeroSpread(tileX, tileY) {
  let spread = (tileX, tileY) => {
    for (let j = -1; j < 2; j++)
      for (let i = -1; i < 2; i++)
        if ((tileX + j) >= 0 && (tileX + j) < mapWidth && (tileY + i) >= 0 && (tileY + i) < mapHeight && openData[(tileX + j) + (tileY + i) * mapWidth] == 0) {
          openData[(tileX + j) + (tileY + i) * mapWidth] = 1;
          if (countData[(tileX + j) + (tileY + i) * mapWidth] == 0)
            spread((tileX + j), (tileY + i));
        }
  };

  if (countData[tileX + tileY * mapWidth] == 0)
    spread(tileX, tileY);
}

function changeFlag(tileX, tileY) {
  flagData[tileX + tileY * mapWidth] = +!flagData[tileX + tileY * mapWidth];
}

function openMines() {
  for (let tileY = 0; tileY < mapHeight; tileY++)
    for (let tileX = 0; tileX < mapWidth; tileX++)
      if (mineData[tileX + tileY * mapWidth] == 1)
        openData[tileX + tileY * mapWidth] = 1;
}

function updateTileData() {
  for (let tileY = 0; tileY < mapHeight; tileY++)
    for (let tileX = 0; tileX < mapWidth; tileX++)
      if (openData[tileX + tileY * mapWidth] == 0)
        if (flagData[tileX + tileY * mapWidth] == 0)
          tileData[tileX + tileY * mapWidth] = 11;
        else
          tileData[tileX + tileY * mapWidth] = 10;
      else if (mineData[tileX + tileY * mapWidth] == 0)
        tileData[tileX + tileY * mapWidth] = countData[tileX + tileY * mapWidth]
      else
        tileData[tileX + tileY * mapWidth] = 9;
}

function checkWin() {
  for (let tileY = 0; tileY < mapHeight; tileY++)
    for (let tileX = 0; tileX < mapWidth; tileX++)
      if (openData[tileX + tileY * mapWidth] == mineData[tileX + tileY * mapWidth])
        return false;
  return true;
}

function draw() {
  for (let tileY = 0; tileY < mapHeight; tileY++)
    for (let tileX = 0; tileX < mapWidth; tileX++) {
      let tileNum = tileData[tileX + tileY * mapWidth];
      for (let spriteY = 0; spriteY < tileSize; spriteY++)
        for (let spriteX = 0; spriteX < tileSize; spriteX++)
          buffer.set(tileX * tileSize + spriteX, tileY * tileSize + spriteY, spriteSheet.get(spriteX + tileNum * tileSize, spriteY));
    }
  display.draw(buffer);
}

function step(tileX, tileY, button) {
  if (state == 0) {
    state = 1;
    resetData();
    draw();
    topBar.innerHTML = "minesweeper";
  } else if (state == 1) {
    if (button == 0) {
      state = 2;
      resetData();
      createMap(tileX, tileY);
      openData[tileX + tileY * mapWidth] = 1;
      zeroSpread(tileX, tileY);
      updateTileData();
      draw();
    }
  } else {
    if (button == 0) {
      if (flagData[tileX + tileY * mapWidth] == 0)
        if (mineData[tileX + tileY * mapWidth] == 0) {
          openData[tileX + tileY * mapWidth] = 1;
          zeroSpread(tileX, tileY);
          if (checkWin()) {
            state = 0;
            topBar.innerHTML = "you win!";
          }
        } else {
          state = 0;
          openMines();
          topBar.innerHTML = "you lose!";
        }
    } else
      changeFlag(tileX, tileY);
    updateTileData();
    draw();
  }
}

document.onmousedown = e => {
  let canvasBoundingClientRect = canvas.getBoundingClientRect();
  let mouseX = Math.floor((e.clientX - canvasBoundingClientRect.x) / canvasBoundingClientRect.width * mapWidth);
  let mouseY = Math.floor((e.clientY - canvasBoundingClientRect.y) / canvasBoundingClientRect.height * mapHeight);
  let button = e.button == 0 ? 0 : 1;
  if (mouseX >= 0 && mouseX < mapWidth && mouseY >= 0 && mouseY < mapHeight)
    step(mouseX, mouseY, button);
};
