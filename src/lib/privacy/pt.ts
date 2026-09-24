import type { PolicyText } from './types.ts';

export const pt: PolicyText = {
  locale: 'pt-BR',
  label: 'Português',
  dir: 'ltr',
  ui: {
    eyebrow: 'Jurídico',
    title: 'Política de Privacidade',
    lede: 'O que o TokenTicks coleta, por quê, quem nos ajuda a tratar esses dados, por quanto tempo os guardamos e os direitos que você tem onde quer que more.',
    effective: 'Em vigor desde {{effective}}',
    language: 'Idioma',
    onThisPage: 'Nesta página',
    translationNote: 'Esta política é publicada em vários idiomas. Se uma tradução divergir do texto em inglês, prevalece o texto em inglês.',
    grievanceFallback: 'o Encarregado de Reclamações do TokenTicks',
    addressFallback: 'disponível mediante solicitação por e-mail',
    emailFallback: 'o formulário "Falar com o suporte" na sua conta',
    back: 'Voltar ao painel',
  },
  sections: [
    {
      id: 'summary',
      title: 'Resumo',
      blocks: [
        'O TokenTicks conta os tokens de prompts de IA e estima quanto custam em diferentes modelos. Os textos que você cola são processados no seu próprio navegador e nunca são enviados para nós.',
        'Coletamos apenas o que uma conta precisa: seu endereço de e-mail, os dados de perfil que você decidir adicionar, seu plano e situação de cobrança e o que você decidir salvar. Não usamos rastreadores de publicidade ou de análise, e não vendemos nem compartilhamos dados pessoais.',
        'Esta política explica o que coletamos, por quê, quem nos ajuda a tratar os dados, por quanto tempo os guardamos e seus direitos segundo as leis da Índia, da União Europeia e do Reino Unido, dos Estados Unidos e de outros países.',
      ],
    },
    {
      id: 'who',
      title: 'Quem somos',
      blocks: [
        'O TokenTicks ("nós") é operado por {{operator}} a partir da Índia. Segundo a Lei de Proteção de Dados Pessoais Digitais da Índia, de 2023, somos o Fiduciário de Dados e, segundo o Regulamento Geral sobre a Proteção de Dados da UE e do Reino Unido, o controlador dos dados pessoais descritos nesta política.',
        'Para qualquer dúvida ou solicitação sobre seus dados, escreva para {{email}}. Para reclamações, veja "Encarregado de reclamações e contato" no fim desta política.',
      ],
    },
    {
      id: 'collect',
      title: 'Informações que coletamos',
      blocks: [
        {
          list: [
            'Conta: seu endereço de e-mail e sua senha. Nosso provedor de autenticação armazena as senhas como um hash com salt que ninguém, nem mesmo nós, consegue ler. Se você entrar com o Google, recebemos seu nome, seu e-mail e seu identificador de conta do Google.',
            'Dados de perfil que você decidir adicionar: nome completo, nome de exibição, telefone e país.',
            'Referência da conta: um identificador TT-XXXXX-XXXXX que geramos para que o suporte encontre sua conta sem pedir dados pessoais.',
            'Plano e cobrança: seu plano, a situação e a data de renovação da assinatura, os identificadores de cliente e de assinatura no Lemon Squeezy, o último valor faturado e a moeda, e a bandeira e os quatro últimos dígitos do seu cartão. Os números completos do cartão são tratados apenas pelo Lemon Squeezy e nunca chegam até nós.',
            'Estimativas salvas: título do projeto, modelo, contagens de tokens, valores de custo e premissas e, somente se você mantiver, uma prévia de até 280 caracteres do prompt. Links de compartilhamento que você decidir criar.',
            'Solicitações de suporte: o assunto e a mensagem que você envia, com o contexto técnico exibido antes do envio (versão do app, navegador e tamanho da tela).',
            'Chaves de linha de comando e MCP: o rótulo que você dá a cada chave, um hash SHA-256 da chave (nunca a chave em si), seus primeiros caracteres e quando foi usada pela última vez.',
            'Dados técnicos: nossos provedores de hospedagem e de banco de dados registram endereços IP e logs de requisições para operar e proteger o serviço.',
          ],
        },
      ],
    },
    {
      id: 'notcollect',
      title: 'O que não coletamos',
      blocks: [
        {
          list: [
            'O texto dos seus prompts, exceto a prévia opcional de 280 caracteres de uma estimativa que você salvar. A contagem e o cálculo de preços acontecem no seu navegador; a ferramenta de linha de comando tokenticks e o servidor MCP rodam na sua própria máquina.',
            'Conjuntos de dados que você carrega em "Batch" e exportações de uso que você carrega em "Reconcile". Eles são lidos no seu navegador e nunca enviados.',
            'Dados de análise, publicidade ou rastreamento entre sites. O app não carrega rastreadores de terceiros.',
          ],
        },
      ],
    },
    {
      id: 'use',
      title: 'Como usamos as informações e nossas bases legais',
      blocks: [
        {
          list: [
            'Para prestar o serviço: criar e proteger sua conta, salvar suas estimativas e links de compartilhamento e aplicar seu plano.',
            'Para receber pagamentos e gerenciar assinaturas, por meio do Lemon Squeezy.',
            'Para responder a solicitações de suporte.',
            'Para verificar as chaves de licença usadas pela ferramenta de linha de comando e pelo servidor MCP.',
            'Para manter o serviço seguro e prevenir fraudes e abusos.',
            'Para enviar mensagens do serviço, como links de acesso e respostas às suas solicitações. Só enviamos e-mails de marketing se você tiver concordado.',
          ],
        },
        'Segundo a Lei de Proteção de Dados Pessoais Digitais da Índia, de 2023, tratamos dados pessoais com base no consentimento que você dá ao criar uma conta e nos usos legítimos que a Lei permite, como dados fornecidos voluntariamente para uma finalidade e o cumprimento da lei. Segundo o GDPR, nossas bases legais são a execução do nosso contrato com você, nosso legítimo interesse em proteger e melhorar o serviço, seu consentimento quando o solicitamos e obrigações legais, como registros fiscais.',
        'Não tomamos decisões sobre você por meios exclusivamente automatizados que produzam efeitos jurídicos ou igualmente significativos, e não fazemos perfilamento.',
      ],
    },
    {
      id: 'providers',
      title: 'Prestadores de serviço que usamos',
      blocks: [
        'Estes prestadores tratam dados pessoais em nosso nome, apenas conforme nossas instruções e segundo seus termos de tratamento de dados. O Lemon Squeezy é o comerciante registrado (merchant of record) dos pagamentos e trata os dados de pagamento como controlador independente, segundo sua própria política de privacidade.',
        {
          table: {
            head: ['Prestador', 'Para quê', 'Onde'],
            rows: [
              ['Supabase', 'Banco de dados, login e funções de servidor', 'Coreia do Sul (Seul)'],
              ['Lemon Squeezy', 'Pagamentos, impostos, faturas e assinaturas (comerciante registrado)', 'Estados Unidos'],
              ['Resend', 'Envio de notificações de solicitações de suporte', 'Estados Unidos'],
              ['Zoho Desk', 'Atendimento das conversas de suporte', 'Data center da Zoho da nossa conta'],
              ['Google', 'Login com o Google, somente se você o usar', 'Global'],
              ['GitHub e npm', 'Hospedagem deste site; distribuição da ferramenta de linha de comando', 'Estados Unidos'],
            ],
          },
        },
      ],
    },
    {
      id: 'transfers',
      title: 'Transferências internacionais',
      blocks: [
        'Os dados da sua conta são armazenados na Coreia do Sul, e alguns prestadores ficam nos Estados Unidos. Por isso, seus dados pessoais podem ser tratados fora do país onde você mora.',
        'Para a Índia, essas transferências são permitidas pela Seção 16 da Lei de Proteção de Dados Pessoais Digitais de 2023, exceto para países que o Governo da Índia restringir. Para o Espaço Econômico Europeu e o Reino Unido, a Coreia do Sul é reconhecida como tendo proteção adequada, e as transferências para os Estados Unidos se baseiam no Data Privacy Framework UE-EUA quando o prestador é certificado, ou em Cláusulas Contratuais Padrão e no Adendo do Reino Unido.',
      ],
    },
    {
      id: 'retention',
      title: 'Por quanto tempo guardamos os dados',
      blocks: [
        {
          list: [
            'Conta, perfil, estimativas salvas, links de compartilhamento, chaves e solicitações de suporte armazenados conosco: até você excluir sua conta.',
            'Cobrança: o Lemon Squeezy guarda faturas e registros fiscais pelo tempo que a lei exigir. Nossa própria cópia dos eventos de cobrança é excluída junto com a sua conta.',
            'Conversas de suporte na nossa central de atendimento: pelo tempo necessário para resolver a solicitação e cumprir obrigações legais; depois são excluídas.',
            'Backups e logs: expiram automaticamente conforme os prazos dos nossos prestadores.',
          ],
        },
        'Você pode excluir sua conta a qualquer momento pelo menu do perfil ("Excluir conta"). Isso remove imediatamente sua conta e os dados acima e cancela qualquer assinatura ativa.',
      ],
    },
    {
      id: 'security',
      title: 'Como protegemos os dados',
      blocks: [
        'Todo o tráfego é criptografado em trânsito. O banco de dados aplica segurança em nível de linha, de modo que cada conta só acessa os próprios registros. As chaves de licença são armazenadas apenas como hashes, e os cartões de pagamento nunca passam pelos nossos sistemas.',
        'Se um incidente com dados pessoais afetar você, avisaremos e comunicaremos as autoridades exigidas por lei, incluindo o Data Protection Board of India e, quando aplicável, as autoridades de controle da UE e do Reino Unido.',
      ],
    },
    {
      id: 'terms',
      title: 'Uso do TokenTicks: contas, planos e disponibilidade',
      blocks: [
        {
          list: [
            'Aceite. Ao criar uma conta — com e-mail e senha, link mágico ou Google — você aceita esta política e estes termos. Se não concordar, não crie uma conta; o contador de tokens funciona sem ela.',
            'Conduta e suspensão. Podemos suspender ou encerrar uma conta usada de forma indevida, incluindo fraude, abuso do serviço ou do seu sistema de pagamento, tentativas de violar sua segurança, compartilhamento de chaves de licença além do uso previsto ou atividade ilegal. Quando apropriado, informaremos o motivo e você poderá responder. A suspensão não elimina seus direitos de proteção de dados.',
            'Preços e planos. Os preços, os planos e os recursos incluídos podem mudar, sujeitos a condições como variações nos nossos custos, nos impostos ou nos preços dos fornecedores de IA. Avisaremos com antecedência razoável antes que uma mudança de preço se aplique à sua próxima renovação, e você poderá cancelar antes disso.',
            'Reembolsos. Os pagamentos dos planos não são reembolsáveis, inclusive por períodos parciais de cobrança, exceto quando a lei do seu país exigir reembolso. Se você cancelar, o plano continua até o fim do período já pago. Os pagamentos são processados pelo Lemon Squeezy como comerciante registrado.',
            'Disponibilidade. Buscamos manter o TokenTicks disponível, mas ele pode ser limitado ou interrompido temporariamente por eventos fora do nosso controle razoável, como desastres naturais, pandemias, guerras, distúrbios civis, atos de governo, sanções, quedas de internet ou de energia, ou falhas dos prestadores dos quais dependemos. Não respondemos por atrasos ou interrupções causados por esses eventos e restabeleceremos o serviço assim que razoavelmente possível.',
            'Estimativas. Contagens de tokens e custos são estimativas para planejamento. Confira os preços de cada fornecedor antes de definir um orçamento.',
            'Lei aplicável. Estes termos são regidos pelas leis da Índia. Isso não elimina nenhuma proteção que você tenha pelas leis obrigatórias de defesa do consumidor ou de proteção de dados do país onde mora.',
          ],
        },
      ],
    },
    {
      id: 'rights-india',
      title: 'Seus direitos na Índia',
      blocks: [
        'Segundo a Lei de Proteção de Dados Pessoais Digitais de 2023 e seu Regulamento, você tem o direito de:',
        {
          list: [
            'obter um resumo dos dados pessoais que tratamos sobre você e do nosso tratamento, e a identidade de quem os recebe;',
            'ter seus dados pessoais corrigidos, completados, atualizados ou apagados;',
            'retirar seu consentimento a qualquer momento, com a mesma facilidade com que o deu, excluindo sua conta ou escrevendo para nós;',
            'ter suas reclamações atendidas pelo nosso Encarregado de Reclamações no prazo previsto no Regulamento;',
            'indicar outra pessoa para exercer seus direitos em caso de morte ou incapacidade.',
          ],
        },
        'Se não ficar satisfeito com nossa resposta, você pode reclamar ao Data Protection Board of India. Também seguimos a Lei de Tecnologia da Informação de 2000 e suas regras sobre práticas razoáveis de segurança. Como a Lei exige, forneça informações corretas e não apresente reclamações falsas ou infundadas.',
      ],
    },
    {
      id: 'rights-eu',
      title: 'Seus direitos no Espaço Econômico Europeu e no Reino Unido',
      blocks: [
        'Segundo o GDPR e o UK GDPR, você tem o direito de acessar seus dados pessoais, corrigi-los, apagá-los, restringir ou se opor ao tratamento, recebê-los em formato portável e retirar o consentimento a qualquer momento. Você também tem o direito de não ficar sujeito a decisões baseadas exclusivamente em tratamento automatizado.',
        'Respondemos às solicitações em até um mês. Você pode reclamar à autoridade de proteção de dados do local onde mora ou trabalha — em Portugal, a CNPD; no Reino Unido, o Information Commissioner\'s Office.',
      ],
    },
    {
      id: 'rights-us',
      title: 'Seus direitos nos Estados Unidos',
      blocks: [
        'Se você mora na Califórnia (segundo a CCPA, alterada pela CPRA) ou em outro estado dos EUA com lei de privacidade do consumidor, como Virgínia, Colorado, Connecticut, Utah ou Texas, tem o direito de saber quais informações pessoais coletamos e como as usamos, de acessá-las, corrigi-las e excluí-las, e de não ser discriminado por exercer esses direitos.',
        'Nos últimos 12 meses coletamos identificadores (como nome e e-mail), informações comerciais (plano e situação de cobrança) e atividade limitada na internet (logs de requisições). Não vendemos nem compartilhamos informações pessoais para publicidade comportamental entre contextos, e não usamos informações pessoais sensíveis para inferir características sobre você. Portanto, não há nada de que se descadastrar; ainda assim, respeitamos os sinais Global Privacy Control. Um agente autorizado pode fazer uma solicitação em seu nome.',
      ],
    },
    {
      id: 'rights-other',
      title: 'Seus direitos em outros lugares',
      blocks: [
        {
          list: [
            'Brasil (LGPD): os direitos do artigo 18, incluindo confirmação, acesso, correção, anonimização, portabilidade e eliminação; você pode peticionar à ANPD.',
            'Canadá (PIPEDA e leis provinciais): acesso e correção; você pode reclamar ao Office of the Privacy Commissioner of Canada.',
            'Austrália (Privacy Act 1988): acesso e correção segundo os Australian Privacy Principles; você pode reclamar ao OAIC.',
            'Singapura (PDPA), Japão (APPI), Coreia do Sul (PIPA) e outros: os direitos de acesso, correção e exclusão que sua lei local lhe garante.',
          ],
        },
        'Onde quer que você more, pode nos pedir para acessar, corrigir ou excluir seus dados em {{email}}, e responderemos de acordo com a sua lei local.',
      ],
    },
    {
      id: 'storage',
      title: 'Cookies e armazenamento local',
      blocks: [
        'Não usamos cookies de publicidade ou de análise. O app guarda alguns itens no armazenamento local do seu navegador para funcionar como você o deixou: o rascunho do seu prompt, o modelo e a comparação escolhidos, suas premissas de custo, seu tema de cores, o idioma desta página e, quando você está conectado, sua sessão.',
        'Esses itens ficam no seu dispositivo e são estritamente necessários para os recursos que você usa, por isso não é preciso um aviso de consentimento. Você pode apagá-los a qualquer momento nas configurações do navegador.',
      ],
    },
    {
      id: 'children',
      title: 'Crianças e adolescentes',
      blocks: [
        'O TokenTicks não se destina a menores de 18 anos. Não tratamos intencionalmente dados pessoais de crianças; a lei indiana exige consentimento verificável dos pais para qualquer pessoa com menos de 18 anos. Se você acredita que uma criança criou uma conta, fale conosco e nós a excluiremos.',
      ],
    },
    {
      id: 'changes',
      title: 'Alterações nesta política',
      blocks: [
        'Quando alteramos esta política, atualizamos a data de vigência no topo. Se uma alteração for relevante, avisaremos por e-mail ou no app antes que entre em vigor. Versões anteriores estão disponíveis mediante solicitação.',
      ],
    },
    {
      id: 'contact',
      title: 'Encarregado de reclamações e contato',
      blocks: [
        'Encarregado de Reclamações e contato de privacidade: {{grievance}}, {{email}}.',
        'Endereço postal: {{address}}.',
        'Confirmamos o recebimento das solicitações prontamente e respondemos em até um mês, ou antes se a sua lei local exigir. Se não ficar satisfeito, você pode reclamar ao Data Protection Board of India ou à autoridade de proteção de dados do lugar onde mora.',
      ],
    },
  ],
};
