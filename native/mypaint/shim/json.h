/*
 * Stand-in for json-c. Didi reads .myb brush files in TypeScript and sets them up through
 * mypaint_brush_set_base_value / set_mapping_*, so mypaint_brush_from_string is never
 * used: this header only lets mypaint-brush.c compile. json_tokener_parse always fails.
 */
#ifndef DIDI_JSON_SHIM_H
#define DIDI_JSON_SHIM_H

#include <stddef.h>

#define JSON_C_MINOR_VERSION 13

typedef struct json_object json_object;
typedef enum { json_type_null, json_type_object, json_type_array } json_type;

static inline json_object *json_tokener_parse(const char *s) { (void)s; return NULL; }
static inline json_object *json_object_new_object(void) { return NULL; }
static inline int json_object_put(json_object *o) { (void)o; return 0; }
static inline int json_object_is_type(const json_object *o, json_type t) { (void)o; (void)t; return 0; }
static inline int json_object_object_get_ex(const json_object *o, const char *k, json_object **v) {
  (void)o; (void)k; if (v) *v = NULL; return 0;
}
static inline json_object *json_object_object_get(const json_object *o, const char *k) { (void)o; (void)k; return NULL; }
static inline double json_object_get_double(const json_object *o) { (void)o; return 0; }
static inline int json_object_get_int(const json_object *o) { (void)o; return 0; }
static inline size_t json_object_array_length(const json_object *o) { (void)o; return 0; }
static inline json_object *json_object_array_get_idx(const json_object *o, size_t i) { (void)o; (void)i; return NULL; }

/* Never iterates. */
#define json_object_object_foreach(obj, key, val) \
  for (char *key = NULL; key != NULL;) for (json_object *val = NULL; val != NULL;)

#endif
