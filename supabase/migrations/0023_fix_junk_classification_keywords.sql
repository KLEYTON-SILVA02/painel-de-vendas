-- Data-corruption fix found while investigating a report of unrelated
-- products showing up in the Biosintética G1-G4 lists: a bulk-import
-- column mix-up left `palavras` (the keyword(s) used to match a sale's
-- product name) set to the literal category/group code instead of a real
-- product-identifying keyword — e.g. a GEN product row with
-- palavras = ['GEN'], or a G1 Biosintética product with palavras = ['G1'].
-- Every GEN and MP row in `products`, and most rows in `bio_groups`, had
-- exactly this corruption. Since `classifyProductTier`/`classifyBio` use
-- `palavras` in place of `nome` whenever it's non-empty, this turned
-- "does the sale's product name contain the string 'gen'/'g1'/...
-- anywhere?" into the de facto matching rule — pulling in unrelated sales
-- (syringes, dermo creams, anything with a compressed SKU code like
-- "MG120ML" containing "g1") and, simultaneously, breaking real matching
-- for the corrupted rows' own products (their actual name was never used
-- as a keyword at all).
--
-- The application code (src/lib/business/classification.ts) now discards
-- any keyword that exactly equals its own category/group code at
-- classification time regardless of what's stored, so this is a data
-- hygiene fix on top of that runtime guard, not the only fix.
update public.products
set palavras = array[nome]
where palavras = array[categoria];

update public.bio_groups
set palavras = array[nome]
where palavras = array[grupo];
