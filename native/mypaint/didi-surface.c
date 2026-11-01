/*
 * Didi's surface for libmypaint (version 2 API, the one MyPaint 2 uses: dab counts and
 * opacity follow the brush dynamics, and pigment mode is available).
 *
 * libmypaint draws into 64x64 tiles of premultiplied RGBA, 15-bit fixed point (1 << 15 is
 * 1.0). This surface keeps the tiles touched by the current stroke in WebAssembly memory:
 * the first time a tile is requested, JavaScript fills it from the layer (Module.loadTile).
 * Written tiles are recorded as dirty, so JavaScript can copy them back to the layer.
 * Clear the surface between strokes.
 */

#include <emscripten.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

#include "mypaint-brush.h"
#include "mypaint-tiled-surface.h"

#define TILE_SIZE MYPAINT_TILE_SIZE
#define TILE_VALUES (TILE_SIZE * TILE_SIZE * 4)

EM_JS(void, js_load_tile, (int tx, int ty, uint16_t *buffer), {
  Module.loadTile(tx, ty, buffer);
});

typedef struct {
  int tx;
  int ty;
  uint16_t *buffer; /* NULL: empty slot */
  int dirty;
} Tile;

typedef struct {
  MyPaintTiledSurface2 parent;
  Tile *tiles; /* open addressing, linear probing */
  int capacity; /* power of two */
  int count;
  int *dirty; /* indices into tiles */
  int dirty_count;
} DidiSurface;

static unsigned hash(int tx, int ty) {
  return (unsigned)tx * 73856093u ^ (unsigned)ty * 19349663u;
}

static Tile *find_slot(Tile *tiles, int capacity, int tx, int ty) {
  unsigned i = hash(tx, ty) & (unsigned)(capacity - 1);
  while (tiles[i].buffer && (tiles[i].tx != tx || tiles[i].ty != ty)) {
    i = (i + 1) & (unsigned)(capacity - 1);
  }
  return &tiles[i];
}

static void grow(DidiSurface *self) {
  int capacity = self->capacity * 2;
  Tile *tiles = calloc((size_t)capacity, sizeof(Tile));
  int *dirty = malloc(sizeof(int) * (size_t)capacity);
  int dirty_count = 0;
  for (int i = 0; i < self->capacity; i++) {
    Tile *old = &self->tiles[i];
    if (!old->buffer) continue;
    Tile *slot = find_slot(tiles, capacity, old->tx, old->ty);
    *slot = *old;
    if (slot->dirty) dirty[dirty_count++] = (int)(slot - tiles);
  }
  free(self->tiles);
  free(self->dirty);
  self->tiles = tiles;
  self->dirty = dirty;
  self->dirty_count = dirty_count;
  self->capacity = capacity;
}

static void tile_request_start(MyPaintTiledSurface2 *surface, MyPaintTileRequest *request) {
  DidiSurface *self = (DidiSurface *)surface;
  if ((self->count + 1) * 2 > self->capacity) grow(self);
  Tile *tile = find_slot(self->tiles, self->capacity, request->tx, request->ty);
  if (!tile->buffer) {
    tile->tx = request->tx;
    tile->ty = request->ty;
    tile->buffer = malloc(TILE_VALUES * sizeof(uint16_t));
    tile->dirty = 0;
    self->count++;
    js_load_tile(request->tx, request->ty, tile->buffer);
  }
  if (!request->readonly && !tile->dirty) {
    tile->dirty = 1;
    self->dirty[self->dirty_count++] = (int)(tile - self->tiles);
  }
  request->buffer = tile->buffer;
}

static void tile_request_end(MyPaintTiledSurface2 *surface, MyPaintTileRequest *request) {
  (void)surface;
  (void)request;
}

static void free_tiles(DidiSurface *self) {
  for (int i = 0; i < self->capacity; i++) free(self->tiles[i].buffer);
  free(self->tiles);
  free(self->dirty);
}

static void destroy(MyPaintSurface *surface) {
  DidiSurface *self = (DidiSurface *)surface;
  mypaint_tiled_surface2_destroy(&self->parent);
  free_tiles(self);
  free(self);
}

static void init_tiles(DidiSurface *self) {
  self->capacity = 64;
  self->tiles = calloc((size_t)self->capacity, sizeof(Tile));
  self->dirty = malloc(sizeof(int) * (size_t)self->capacity);
  self->count = 0;
  self->dirty_count = 0;
}

EMSCRIPTEN_KEEPALIVE
DidiSurface *didi_surface_new(void) {
  /* calloc: libmypaint leaves some fields (num_bboxes_dirtied) uninitialized. */
  DidiSurface *self = calloc(1, sizeof(DidiSurface));
  mypaint_tiled_surface2_init(&self->parent, tile_request_start, tile_request_end);
  self->parent.parent.parent.destroy = destroy;
  init_tiles(self);
  return self;
}

EMSCRIPTEN_KEEPALIVE
void didi_surface_destroy(DidiSurface *self) {
  mypaint_surface_unref((MyPaintSurface *)self);
}

/* Forgets every tile: call before each stroke. */
EMSCRIPTEN_KEEPALIVE
void didi_surface_clear(DidiSurface *self) {
  free_tiles(self);
  init_tiles(self);
}

/*
 * Writes the coordinates of the tiles written since the last call (tx, ty pairs) into
 * `out`, at most `max` tiles, and forgets them. Returns the number of tiles.
 */
EMSCRIPTEN_KEEPALIVE
int didi_surface_take_dirty(DidiSurface *self, int *out, int max) {
  int n = 0;
  while (self->dirty_count > 0 && n < max) {
    Tile *tile = &self->tiles[self->dirty[--self->dirty_count]];
    tile->dirty = 0;
    out[2 * n] = tile->tx;
    out[2 * n + 1] = tile->ty;
    n++;
  }
  return n;
}

/* The tile buffer, or NULL if this tile was never requested. */
EMSCRIPTEN_KEEPALIVE
uint16_t *didi_surface_tile(DidiSurface *self, int tx, int ty) {
  return find_slot(self->tiles, self->capacity, tx, ty)->buffer;
}

/*
 * Moves the brush to a new position, drawing the dabs on the surface. `viewzoom` and
 * `viewrotation` (degrees) describe the view: brush speed is measured on screen.
 */
EMSCRIPTEN_KEEPALIVE
void didi_stroke_to(MyPaintBrush *brush, DidiSurface *self, float x, float y, float pressure,
                    float xtilt, float ytilt, double dtime, float viewzoom, float viewrotation) {
  MyPaintSurface2 *surface = (MyPaintSurface2 *)self;
  MyPaintRectangle rect;
  MyPaintRectangles roi = {1, &rect};
  mypaint_surface_begin_atomic((MyPaintSurface *)surface);
  mypaint_brush_stroke_to_2(brush, surface, x, y, pressure, xtilt, ytilt, dtime, viewzoom,
                            viewrotation, 0);
  mypaint_surface2_end_atomic(surface, &roi);
}

/*
 * Seeds the C random generator. libmypaint samples smudge colors on a random subset of
 * pixels with rand(): seeding it at the start of each stroke makes strokes reproducible.
 */
EMSCRIPTEN_KEEPALIVE
void didi_seed(unsigned seed) {
  srand(seed);
}
