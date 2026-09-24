import type { PolicyText } from './types.ts';

export const fr: PolicyText = {
  locale: 'fr-FR',
  label: 'Français',
  dir: 'ltr',
  ui: {
    eyebrow: 'Mentions légales',
    title: 'Politique de confidentialité',
    lede: 'Ce que TokenTicks collecte, pourquoi, qui nous aide à le traiter, combien de temps nous le conservons et les droits dont vous disposez où que vous viviez.',
    effective: 'En vigueur le {{effective}}',
    language: 'Langue',
    onThisPage: 'Sur cette page',
    translationNote: 'Cette politique est publiée en plusieurs langues. En cas de divergence entre une traduction et le texte anglais, le texte anglais prévaut.',
    grievanceFallback: 'le Responsable des réclamations de TokenTicks',
    addressFallback: 'communiquée sur demande par e-mail',
    emailFallback: 'le formulaire « Contacter le support » de votre compte',
    back: 'Retour au tableau de bord',
  },
  sections: [
    {
      id: 'summary',
      title: 'Résumé',
      blocks: [
        'TokenTicks compte les tokens des requêtes (prompts) d\'IA et estime leur coût selon les modèles. Les textes que vous collez sont traités dans votre propre navigateur et ne nous sont jamais envoyés.',
        'Nous ne collectons que ce dont un compte a besoin : votre adresse e-mail, les informations de profil que vous choisissez d\'ajouter, votre formule et votre statut de facturation, et ce que vous choisissez d\'enregistrer. Nous n\'utilisons aucun traceur publicitaire ou analytique, et nous ne vendons ni ne partageons de données personnelles.',
        'Cette politique explique ce que nous collectons, pourquoi, qui nous aide à le traiter, combien de temps nous le conservons et vos droits en vertu des lois de l\'Inde, de l\'Union européenne et du Royaume-Uni, des États-Unis et d\'autres pays.',
      ],
    },
    {
      id: 'who',
      title: 'Qui sommes-nous',
      blocks: [
        'TokenTicks (« nous ») est exploité par {{operator}} depuis l\'Inde. Au sens de la loi indienne de 2023 sur la protection des données personnelles numériques, nous sommes le fiduciaire des données et, au sens du Règlement général sur la protection des données de l\'UE et du Royaume-Uni, le responsable du traitement des données personnelles décrites dans cette politique.',
        'Pour toute question ou demande concernant vos données, écrivez à {{email}}. Pour les réclamations, consultez « Responsable des réclamations et contact » à la fin de cette politique.',
      ],
    },
    {
      id: 'collect',
      title: 'Informations que nous collectons',
      blocks: [
        {
          list: [
            'Compte : votre adresse e-mail et votre mot de passe. Notre fournisseur d\'authentification stocke les mots de passe sous forme de hachage salé que personne, pas même nous, ne peut lire. Si vous vous connectez avec Google, nous recevons votre nom, votre adresse e-mail et votre identifiant de compte Google.',
            'Informations de profil que vous choisissez d\'ajouter : nom complet, nom d\'affichage, numéro de téléphone et pays.',
            'Référence de compte : un identifiant TT-XXXXX-XXXXX que nous générons pour que le support retrouve votre compte sans vous demander d\'informations personnelles.',
            'Formule et facturation : votre formule, le statut et la date de renouvellement de votre abonnement, vos identifiants client et abonnement Lemon Squeezy, le dernier montant facturé et sa devise, ainsi que la marque et les quatre derniers chiffres de votre carte. Les numéros de carte complets sont traités uniquement par Lemon Squeezy et ne nous parviennent jamais.',
            'Estimations enregistrées : titre du projet, modèle, nombre de tokens, coûts et hypothèses et, seulement si vous le conservez, un aperçu de 280 caractères au plus de la requête. Les liens de partage que vous choisissez de créer.',
            'Demandes d\'assistance : l\'objet et le message que vous envoyez, avec le contexte technique qui vous est présenté avant l\'envoi (version de l\'application, navigateur et taille d\'écran).',
            'Clés de ligne de commande et MCP : le libellé que vous donnez à chaque clé, un hachage SHA-256 de la clé (jamais la clé elle-même), ses premiers caractères et sa date de dernière utilisation.',
            'Données techniques : nos hébergeurs et fournisseurs de base de données enregistrent les adresses IP et les journaux de requêtes pour exploiter et sécuriser le service.',
          ],
        },
      ],
    },
    {
      id: 'notcollect',
      title: 'Ce que nous ne collectons pas',
      blocks: [
        {
          list: [
            'Le texte de vos requêtes, hormis l\'aperçu facultatif de 280 caractères d\'une estimation que vous enregistrez. Le comptage et la tarification ont lieu dans votre navigateur ; l\'outil en ligne de commande tokenticks et le serveur MCP s\'exécutent sur votre propre machine.',
            'Les jeux de données que vous chargez dans « Batch » et les exports d\'utilisation que vous chargez dans « Reconcile ». Ils sont lus dans votre navigateur et jamais téléversés.',
            'Les données d\'analyse, de publicité ou de suivi intersites. L\'application ne charge aucun traceur tiers.',
          ],
        },
      ],
    },
    {
      id: 'use',
      title: 'Utilisation des informations et bases légales',
      blocks: [
        {
          list: [
            'Fournir le service : créer et sécuriser votre compte, enregistrer vos estimations et liens de partage, et appliquer votre formule.',
            'Encaisser les paiements et gérer les abonnements, par l\'intermédiaire de Lemon Squeezy.',
            'Répondre aux demandes d\'assistance.',
            'Vérifier les clés de licence utilisées par l\'outil en ligne de commande et le serveur MCP.',
            'Assurer la sécurité du service et prévenir la fraude et les abus.',
            'Envoyer des messages de service, comme les liens de connexion et les réponses à vos demandes. Nous n\'envoyons d\'e-mails marketing que si vous l\'avez accepté.',
          ],
        },
        'En vertu de la loi indienne de 2023 sur la protection des données personnelles numériques, nous traitons les données personnelles sur la base du consentement que vous donnez en créant un compte et des usages légitimes que la loi autorise, comme les données que vous fournissez volontairement dans un but précis et le respect de la loi. En vertu du RGPD, nos bases légales sont l\'exécution de notre contrat avec vous, notre intérêt légitime à sécuriser et améliorer le service, votre consentement lorsque nous le demandons, et nos obligations légales, par exemple en matière fiscale.',
        'Nous ne prenons à votre sujet aucune décision fondée sur un traitement automatisé produisant des effets juridiques ou des effets similaires importants, et nous ne faisons pas de profilage.',
      ],
    },
    {
      id: 'providers',
      title: 'Prestataires auxquels nous faisons appel',
      blocks: [
        'Ces prestataires traitent des données personnelles pour notre compte, uniquement sur nos instructions et selon leurs conditions de traitement des données. Lemon Squeezy est le marchand officiel (merchant of record) des paiements et traite les données de paiement en tant que responsable de traitement indépendant, selon sa propre politique de confidentialité.',
        {
          table: {
            head: ['Prestataire', 'Finalité', 'Localisation'],
            rows: [
              ['Supabase', 'Base de données, connexion et fonctions serveur', 'Corée du Sud (Séoul)'],
              ['Lemon Squeezy', 'Paiements, taxes, factures et abonnements (marchand officiel)', 'États-Unis'],
              ['Resend', 'Envoi des notifications de demandes d\'assistance', 'États-Unis'],
              ['Zoho Desk', 'Gestion des échanges avec le support', 'Centre de données Zoho de notre compte'],
              ['Google', 'Connexion avec Google, uniquement si vous l\'utilisez', 'Monde'],
              ['GitHub et npm', 'Hébergement de ce site ; distribution de l\'outil en ligne de commande', 'États-Unis'],
            ],
          },
        },
      ],
    },
    {
      id: 'transfers',
      title: 'Transferts internationaux',
      blocks: [
        'Les données de votre compte sont stockées en Corée du Sud et certains prestataires se trouvent aux États-Unis. Vos données personnelles peuvent donc être traitées hors de votre pays de résidence.',
        'Pour l\'Inde, ces transferts sont autorisés par l\'article 16 de la loi de 2023 sur la protection des données personnelles numériques, sauf vers les pays que le gouvernement indien restreint. Pour l\'Espace économique européen et le Royaume-Uni, la Corée du Sud est reconnue comme offrant une protection adéquate, et les transferts vers les États-Unis reposent sur le cadre de protection des données UE-États-Unis lorsque le prestataire est certifié, ou sur les clauses contractuelles types et l\'addendum britannique.',
      ],
    },
    {
      id: 'retention',
      title: 'Durée de conservation',
      blocks: [
        {
          list: [
            'Compte, profil, estimations enregistrées, liens de partage, clés et demandes d\'assistance stockés chez nous : jusqu\'à la suppression de votre compte.',
            'Facturation : Lemon Squeezy conserve les factures et les documents fiscaux aussi longtemps que la loi l\'exige. Notre propre copie des événements de facturation est supprimée avec votre compte.',
            'Échanges avec le support dans notre outil d\'assistance : le temps nécessaire pour traiter la demande et respecter nos obligations légales, puis ils sont supprimés.',
            'Sauvegardes et journaux : ils expirent automatiquement selon les calendriers de nos prestataires.',
          ],
        },
        'Vous pouvez supprimer votre compte à tout moment depuis le menu du profil (« Supprimer le compte »). Cela efface immédiatement votre compte et les données ci-dessus et résilie tout abonnement actif.',
      ],
    },
    {
      id: 'security',
      title: 'Protection des données',
      blocks: [
        'Tout le trafic est chiffré en transit. La base de données applique une sécurité au niveau des lignes, de sorte que chaque compte n\'accède qu\'à ses propres enregistrements. Les clés de licence ne sont stockées que sous forme de hachage et les cartes de paiement ne transitent jamais par nos systèmes.',
        'Si une violation de données personnelles vous concerne, nous vous en informerons et la notifierons aux autorités compétentes, notamment le Data Protection Board of India et, le cas échéant, les autorités de contrôle de l\'UE et du Royaume-Uni.',
      ],
    },
    {
      id: 'terms',
      title: 'Utilisation de TokenTicks : comptes, formules et disponibilité',
      blocks: [
        {
          list: [
            'Acceptation. En créant un compte, par e-mail et mot de passe, par lien magique ou avec Google, vous acceptez cette politique et ces conditions. Si vous n\'êtes pas d\'accord, veuillez ne pas créer de compte ; le compteur de tokens fonctionne sans.',
            'Comportement et suspension. Nous pouvons suspendre ou fermer un compte utilisé de manière abusive, notamment en cas de fraude, d\'abus du service ou de son système de paiement, de tentative de contourner sa sécurité, de partage de clés de licence au-delà de leur usage prévu ou d\'activité illicite. Le cas échéant, nous vous en indiquerons la raison et vous pourrez répondre. La suspension ne supprime pas vos droits en matière de protection des données.',
            'Prix et formules. Les prix, les formules et les fonctionnalités incluses peuvent évoluer, sous réserve de conditions telles que l\'évolution de nos coûts, des taxes ou des prix des fournisseurs d\'IA. Nous vous préviendrons dans un délai raisonnable avant qu\'un changement de prix ne s\'applique à votre prochain renouvellement, et vous pourrez résilier avant.',
            'Remboursements. Les paiements des formules ne sont pas remboursables, y compris pour les périodes de facturation partielles, sauf lorsque la loi de votre pays impose un remboursement. En cas de résiliation, votre formule reste active jusqu\'à la fin de la période déjà payée. Les paiements sont traités par Lemon Squeezy en tant que marchand officiel.',
            'Disponibilité. Nous nous efforçons de maintenir TokenTicks disponible, mais le service peut être temporairement limité ou interrompu par des événements échappant à notre contrôle raisonnable, tels que catastrophes naturelles, pandémies, guerres, troubles civils, décisions des pouvoirs publics, sanctions, coupures d\'internet ou d\'électricité, ou défaillances des prestataires dont nous dépendons. Nous ne sommes pas responsables des retards ou interruptions causés par de tels événements et rétablirons le service dès que raisonnablement possible.',
            'Estimations. Les nombres de tokens et les coûts sont des estimations de planification. Vérifiez les prix de chaque fournisseur avant d\'engager un budget.',
            'Droit applicable. Ces conditions sont régies par le droit indien. Cela ne vous prive d\'aucune protection accordée par les lois impératives de protection des consommateurs ou des données de votre pays de résidence.',
          ],
        },
      ],
    },
    {
      id: 'rights-india',
      title: 'Vos droits en Inde',
      blocks: [
        'En vertu de la loi de 2023 sur la protection des données personnelles numériques et de ses règles d\'application, vous avez le droit :',
        {
          list: [
            'd\'obtenir un résumé des données personnelles que nous traitons à votre sujet et de nos traitements, ainsi que l\'identité des personnes avec qui nous les partageons ;',
            'de faire corriger, compléter, mettre à jour ou effacer vos données personnelles ;',
            'de retirer votre consentement à tout moment, aussi facilement que vous l\'avez donné, en supprimant votre compte ou en nous écrivant ;',
            'de voir vos réclamations traitées par notre Responsable des réclamations dans le délai fixé par les règles ;',
            'de désigner une autre personne pour exercer vos droits en cas de décès ou d\'incapacité.',
          ],
        },
        'Si notre réponse ne vous satisfait pas, vous pouvez saisir le Data Protection Board of India. Nous respectons également l\'Information Technology Act de 2000 et ses règles sur les pratiques de sécurité raisonnables. Comme l\'exige la loi, merci de fournir des informations exactes et de ne pas déposer de réclamations fausses ou abusives.',
      ],
    },
    {
      id: 'rights-eu',
      title: 'Vos droits dans l\'Espace économique européen et au Royaume-Uni',
      blocks: [
        'En vertu du RGPD et du RGPD britannique, vous avez le droit d\'accéder à vos données personnelles, de les faire rectifier, de les faire effacer, d\'en limiter le traitement ou de vous y opposer, de les recevoir dans un format portable et de retirer votre consentement à tout moment. Vous avez également le droit de ne pas faire l\'objet d\'une décision fondée exclusivement sur un traitement automatisé.',
        'Nous répondons aux demandes dans un délai d\'un mois. Vous pouvez introduire une réclamation auprès de l\'autorité de protection des données de votre lieu de résidence ou de travail ; en France, la CNIL, et au Royaume-Uni, l\'Information Commissioner\'s Office.',
      ],
    },
    {
      id: 'rights-us',
      title: 'Vos droits aux États-Unis',
      blocks: [
        'Si vous résidez en Californie (en vertu du CCPA modifié par le CPRA) ou dans un autre État américain doté d\'une loi sur la protection de la vie privée des consommateurs, comme la Virginie, le Colorado, le Connecticut, l\'Utah ou le Texas, vous avez le droit de savoir quelles informations personnelles nous collectons et comment nous les utilisons, d\'y accéder, de les corriger et de les supprimer, et de ne pas subir de discrimination pour avoir exercé ces droits.',
        'Au cours des 12 derniers mois, nous avons collecté des identifiants (comme le nom et l\'e-mail), des informations commerciales (formule et statut de facturation) et une activité internet limitée (journaux de requêtes). Nous ne vendons ni ne partageons d\'informations personnelles à des fins de publicité comportementale intercontextuelle, et nous n\'utilisons pas d\'informations personnelles sensibles pour déduire vos caractéristiques. Il n\'y a donc rien à refuser ; nous respectons néanmoins les signaux Global Privacy Control. Un mandataire autorisé peut présenter une demande en votre nom.',
      ],
    },
    {
      id: 'rights-other',
      title: 'Vos droits ailleurs',
      blocks: [
        {
          list: [
            'Brésil (LGPD) : les droits de l\'article 18, notamment la confirmation, l\'accès, la rectification, l\'anonymisation, la portabilité et la suppression ; vous pouvez saisir l\'ANPD.',
            'Canada (LPRPDE et lois provinciales) : accès et rectification ; vous pouvez saisir le Commissariat à la protection de la vie privée du Canada.',
            'Australie (Privacy Act 1988) : accès et rectification selon les Australian Privacy Principles ; vous pouvez saisir l\'OAIC.',
            'Singapour (PDPA), Japon (APPI), Corée du Sud (PIPA) et autres : les droits d\'accès, de rectification et de suppression que vous accorde votre loi locale.',
          ],
        },
        'Où que vous viviez, vous pouvez nous demander d\'accéder à vos données, de les corriger ou de les supprimer en écrivant à {{email}}, et nous répondrons conformément à votre loi locale.',
      ],
    },
    {
      id: 'storage',
      title: 'Cookies et stockage local',
      blocks: [
        'Nous n\'utilisons pas de cookies publicitaires ni analytiques. L\'application conserve quelques éléments dans le stockage local de votre navigateur pour fonctionner comme vous l\'avez laissée : le brouillon de votre requête, le modèle et la comparaison choisis, vos hypothèses de coût, votre thème de couleur, la langue de cette page et, lorsque vous êtes connecté, votre session.',
        'Ces éléments restent sur votre appareil et sont strictement nécessaires aux fonctionnalités que vous utilisez ; aucun bandeau de consentement n\'est donc requis. Vous pouvez les effacer à tout moment dans les paramètres de votre navigateur.',
      ],
    },
    {
      id: 'children',
      title: 'Enfants',
      blocks: [
        'TokenTicks n\'est pas destiné aux personnes de moins de 18 ans. Nous ne traitons pas sciemment de données personnelles d\'enfants ; la loi indienne exige un consentement parental vérifiable pour toute personne de moins de 18 ans. Si vous pensez qu\'un enfant a créé un compte, contactez-nous et nous le supprimerons.',
      ],
    },
    {
      id: 'changes',
      title: 'Modifications de cette politique',
      blocks: [
        'Lorsque nous modifions cette politique, nous mettons à jour la date d\'entrée en vigueur indiquée en haut. Si une modification est importante, nous vous en informerons par e-mail ou dans l\'application avant qu\'elle ne prenne effet. Les versions antérieures sont disponibles sur demande.',
      ],
    },
    {
      id: 'contact',
      title: 'Responsable des réclamations et contact',
      blocks: [
        'Responsable des réclamations et contact pour la confidentialité : {{grievance}}, {{email}}.',
        'Adresse postale : {{address}}.',
        'Nous accusons réception des demandes rapidement et y répondons dans un délai d\'un mois, ou plus tôt si votre loi locale l\'exige. Si vous n\'êtes pas satisfait, vous pouvez saisir le Data Protection Board of India ou l\'autorité de protection des données de votre lieu de résidence.',
      ],
    },
  ],
};
