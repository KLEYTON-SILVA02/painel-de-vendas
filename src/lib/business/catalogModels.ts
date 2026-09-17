// PLANO B (MONITORAMENTO DE LOJAS) — grupos de lojas que compartilham o
// mesmo padrão de nomenclatura de produto (mesma rede/franquia), usados para
// casar produtos por nome com confiança entre lojas diferentes. Lista fixa
// de propósito: uma loja escolhe a própria chave em Minha Loja, mas nenhum
// admin pode inventar ou ver outras — adicionar um grupo novo é um deploy
// (esta lista + o check constraint em stores.modelo_catalogo, migration
// 0076_catalog_shared_model.sql, precisam mudar juntos).
export interface CatalogModel {
  id: string;
  label: string;
}

export const CATALOG_MODELS: CatalogModel[] = [
  { id: 'rede_extrafarma_pague_menos', label: 'Extrafarma / Pague Menos' },
];
