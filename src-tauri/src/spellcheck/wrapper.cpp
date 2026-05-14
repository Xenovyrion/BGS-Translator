#include "wrapper.h"
#include <nuspell/dictionary.hxx>
#include <filesystem>
#include <cstdlib>
#include <cstring>
#include <string>
#include <vector>

struct NuspellDict {
    nuspell::Dictionary dict;
};

extern "C" {

NuspellDict* nuspell_load(const char* aff_path)
{
    if (!aff_path) return nullptr;
    NuspellDict* nd = nullptr;
    try {
        nd = new NuspellDict();
        nd->dict.load_aff_dic(std::filesystem::u8path(aff_path));
        return nd;
    } catch (...) {
        delete nd;
        return nullptr;
    }
}

void nuspell_free(NuspellDict* dict)
{
    delete dict;
}

int nuspell_spell(const NuspellDict* dict, const char* word)
{
    if (!dict || !word) return 0;
    return dict->dict.spell(word) ? 1 : 0;
}

char** nuspell_suggest(const NuspellDict* dict, const char* word, int* count_out)
{
    if (count_out) *count_out = 0;
    if (!dict || !word) return nullptr;

    std::vector<std::string> suggestions;
    dict->dict.suggest(word, suggestions);

    int n = static_cast<int>(suggestions.size());
    if (n == 0) return nullptr;

    char** result = static_cast<char**>(std::malloc(n * sizeof(char*)));
    if (!result) return nullptr;

    for (int i = 0; i < n; ++i) {
        const auto& s = suggestions[i];
        result[i] = static_cast<char*>(std::malloc(s.size() + 1));
        if (result[i]) std::memcpy(result[i], s.c_str(), s.size() + 1);
    }

    if (count_out) *count_out = n;
    return result;
}

void nuspell_free_suggestions(char** suggestions, int count)
{
    if (!suggestions) return;
    for (int i = 0; i < count; ++i) std::free(suggestions[i]);
    std::free(suggestions);
}

} // extern "C"
