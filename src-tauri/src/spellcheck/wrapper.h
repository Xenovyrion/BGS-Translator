#pragma once

#ifdef __cplusplus
extern "C" {
#endif

typedef struct NuspellDict NuspellDict;

/* Load a dictionary from the path to the .aff file (the .dic file is found automatically).
   Returns NULL on failure. The caller owns the returned pointer and must free it with nuspell_free(). */
NuspellDict* nuspell_load(const char* aff_path);

/* Free a dictionary previously loaded with nuspell_load(). Safe to call with NULL. */
void nuspell_free(NuspellDict* dict);

/* Returns 1 if the word is correctly spelled, 0 otherwise. */
int nuspell_spell(const NuspellDict* dict, const char* word);

/* Returns a heap-allocated array of null-terminated suggestion strings.
   *count_out receives the number of elements. Free with nuspell_free_suggestions(). */
char** nuspell_suggest(const NuspellDict* dict, const char* word, int* count_out);

/* Free the array returned by nuspell_suggest(). Safe to call with NULL. */
void nuspell_free_suggestions(char** suggestions, int count);

#ifdef __cplusplus
}
#endif
