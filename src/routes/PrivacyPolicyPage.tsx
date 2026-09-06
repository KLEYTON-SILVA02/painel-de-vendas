// Publicamente acessível (sem login) em /privacidade — Google Play e a App
// Store exigem uma URL de política de privacidade alcançável por qualquer
// pessoa (incluindo o revisor da loja, que nunca terá uma conta de
// colaborador/ADM) para qualquer app que peça permissão de notificação ou
// colete dados pessoais, como este. Descreve os dados reais que o sistema
// trata — nenhuma categoria genérica de modelo — para casar com o que
// realmente sai no formulário "Data Safety" do Play Console.
export function PrivacyPolicyPage() {
  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '32px 20px', color: '#e2e8f0', lineHeight: 1.6, fontSize: 14 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Política de Privacidade — Gestão de Vendas</h1>
      <p style={{ color: '#94a3b8', marginBottom: 24 }}>Última atualização: setembro de 2026</p>

      <p style={{ marginBottom: 16 }}>
        O aplicativo <b>Gestão de Vendas</b> é um sistema interno de gestão de vendas e desempenho, usado por lojas para
        acompanhar metas, rankings e comunicar seus próprios colaboradores. Cada loja opera de forma isolada: os dados
        de uma loja nunca são acessíveis por outra.
      </p>

      <h2 style={{ fontSize: 16, fontWeight: 700, marginTop: 24, marginBottom: 8 }}>Quais dados o app trata</h2>
      <ul style={{ paddingLeft: 20, marginBottom: 16 }}>
        <li>Nome, matrícula, apelido, setor e número de celular do colaborador (cadastrados pelo administrador da loja).</li>
        <li>Fotos de perfil e de conquistas enviadas pelo próprio colaborador ou pelo administrador.</li>
        <li>Registros de vendas (produto, quantidade, valor e data) importados pelo administrador da loja.</li>
        <li>Credenciais de acesso (e-mail do administrador, ou matrícula + senha do colaborador).</li>
        <li>Token de notificação push do aparelho, usado apenas para entregar avisos de atualização de vendas e metas.</li>
      </ul>

      <h2 style={{ fontSize: 16, fontWeight: 700, marginTop: 24, marginBottom: 8 }}>Para que esses dados são usados</h2>
      <p style={{ marginBottom: 16 }}>
        Exclusivamente para operar as funções do próprio app: calcular rankings e metas, exibir o desempenho do
        colaborador, e enviar notificações quando novas vendas são registradas em seu nome. Nenhum dado é vendido,
        alugado ou compartilhado com terceiros para publicidade. Não há SDKs de anúncio ou de rastreamento de terceiros
        no app.
      </p>

      <h2 style={{ fontSize: 16, fontWeight: 700, marginTop: 24, marginBottom: 8 }}>Onde os dados ficam armazenados</h2>
      <p style={{ marginBottom: 16 }}>
        Em um banco de dados (Supabase, com criptografia em trânsito via HTTPS) isolado por loja, com controle de acesso
        que restringe cada administrador e colaborador aos dados da própria loja. Fotos ficam em armazenamento de
        objetos com o mesmo isolamento por loja.
      </p>

      <h2 style={{ fontSize: 16, fontWeight: 700, marginTop: 24, marginBottom: 8 }}>Retenção e exclusão</h2>
      <p style={{ marginBottom: 16 }}>
        Os dados de uma loja permanecem enquanto a loja usar o sistema. O administrador da loja pode excluir
        colaboradores, vendas ou a própria conta a qualquer momento pelas telas do app; solicitações de exclusão total
        dos dados de uma loja podem ser feitas diretamente ao administrador daquela loja.
      </p>

      <h2 style={{ fontSize: 16, fontWeight: 700, marginTop: 24, marginBottom: 8 }}>Contato</h2>
      <p>
        Dúvidas sobre esta política podem ser encaminhadas ao administrador da loja que forneceu o acesso ao
        aplicativo.
      </p>
    </div>
  );
}
