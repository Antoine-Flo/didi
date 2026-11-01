/* Build configuration of libmypaint for WebAssembly (replaces the autotools config.h). */
#ifndef DIDI_MYPAINT_CONFIG_H
#define DIDI_MYPAINT_CONFIG_H

#define HAVE_INTTYPES_H 1
#define HAVE_STDINT_H 1
#define HAVE_STDLIB_H 1
#define HAVE_STRING_H 1
#define STDC_HEADERS 1

/* No glib, no gettext: plain C. */
#define MYPAINT_CONFIG_USE_GLIB 0

#define PACKAGE_NAME "libmypaint"
#define PACKAGE_VERSION "1.6.1"
#define GETTEXT_PACKAGE "libmypaint"

#endif

/*
 * libmypaint reads some heap fields it never initializes (e.g. num_bboxes_dirtied of tiled
 * surfaces, and states used by the version 2 API), which made strokes differ from one run
 * to the next. Zeroed allocations make it deterministic. Allocations are rare (brushes,
 * surfaces, operation queues), so the cost is negligible.
 */
#include <stdlib.h>
#define malloc(size) calloc(1, (size))
