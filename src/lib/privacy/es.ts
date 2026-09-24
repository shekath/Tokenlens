import type { PolicyText } from './types.ts';

export const es: PolicyText = {
  locale: 'es-ES',
  label: 'Español',
  dir: 'ltr',
  ui: {
    eyebrow: 'Legal',
    title: 'Política de privacidad',
    lede: 'Qué recopila TokenTicks, por qué, quién nos ayuda a tratarlo, cuánto tiempo lo conservamos y los derechos que tiene viva donde viva.',
    effective: 'Vigente desde el {{effective}}',
    language: 'Idioma',
    onThisPage: 'En esta página',
    translationNote: 'Esta política se publica en varios idiomas. Si una traducción difiere del texto en inglés, prevalece el texto en inglés.',
    grievanceFallback: 'el Responsable de Reclamaciones de TokenTicks',
    addressFallback: 'disponible previa solicitud por correo electrónico',
    emailFallback: 'el formulario «Contactar con soporte» de su cuenta',
    back: 'Volver al panel',
  },
  sections: [
    {
      id: 'summary',
      title: 'Resumen',
      blocks: [
        'TokenTicks cuenta los tokens de las instrucciones (prompts) para IA y estima su coste en distintos modelos. Los textos que pega se procesan en su propio navegador y nunca se nos envían.',
        'Solo recopilamos lo que una cuenta necesita: su dirección de correo electrónico, los datos de perfil que decida añadir, su plan y estado de facturación, y lo que decida guardar. No utilizamos rastreadores publicitarios ni analíticos, y no vendemos ni compartimos datos personales.',
        'Esta política explica qué recopilamos, por qué, quién nos ayuda a tratarlo, cuánto tiempo lo conservamos y sus derechos según las leyes de la India, la Unión Europea y el Reino Unido, los Estados Unidos y otros países.',
      ],
    },
    {
      id: 'who',
      title: 'Quiénes somos',
      blocks: [
        'TokenTicks («nosotros») está gestionado por {{operator}} desde la India. Conforme a la Ley de Protección de Datos Personales Digitales de la India de 2023 somos el Fiduciario de Datos y, conforme al Reglamento General de Protección de Datos de la UE y del Reino Unido, el responsable del tratamiento de los datos personales descritos en esta política.',
        'Para cualquier pregunta o solicitud sobre sus datos, escriba a {{email}}. Para reclamaciones, consulte «Responsable de reclamaciones y contacto» al final de esta política.',
      ],
    },
    {
      id: 'collect',
      title: 'Información que recopilamos',
      blocks: [
        {
          list: [
            'Cuenta: su dirección de correo electrónico y su contraseña. Nuestro proveedor de autenticación guarda las contraseñas como un hash con sal que nadie, ni siquiera nosotros, puede leer. Si inicia sesión con Google, recibimos su nombre, su correo electrónico y su identificador de cuenta de Google.',
            'Datos de perfil que decida añadir: nombre completo, nombre visible, número de teléfono y país.',
            'Referencia de cuenta: un identificador TT-XXXXX-XXXXX que generamos para que el soporte encuentre su cuenta sin pedirle datos personales.',
            'Plan y facturación: su plan, el estado y la fecha de renovación de la suscripción, los identificadores de cliente y suscripción de Lemon Squeezy, el último importe facturado y su moneda, y la marca y los cuatro últimos dígitos de su tarjeta. Los números completos de tarjeta solo los gestiona Lemon Squeezy y nunca llegan a nosotros.',
            'Estimaciones guardadas: título del proyecto, modelo, recuentos de tokens, cifras de coste y supuestos y, solo si decide conservarla, una vista previa de hasta 280 caracteres del texto. Los enlaces para compartir que decida crear.',
            'Solicitudes de soporte: el asunto y el mensaje que envía, con el contexto técnico que se le muestra antes de enviarlo (versión de la aplicación, navegador y tamaño de pantalla).',
            'Claves de línea de comandos y MCP: la etiqueta que da a cada clave, un hash SHA-256 de la clave (nunca la clave en sí), sus primeros caracteres y la última vez que se usó.',
            'Datos técnicos: nuestros proveedores de alojamiento y base de datos registran direcciones IP y registros de solicitudes para operar y proteger el servicio.',
          ],
        },
      ],
    },
    {
      id: 'notcollect',
      title: 'Lo que no recopilamos',
      blocks: [
        {
          list: [
            'El texto de sus instrucciones, salvo la vista previa opcional de 280 caracteres de una estimación que guarde. El recuento y el cálculo de precios se realizan en su navegador; la herramienta de línea de comandos tokenticks y el servidor MCP se ejecutan en su propio equipo.',
            'Los conjuntos de datos que carga en «Batch» y las exportaciones de uso que carga en «Reconcile». Se leen en su navegador y nunca se suben.',
            'Datos de analítica, publicidad o seguimiento entre sitios. La aplicación no carga rastreadores de terceros.',
          ],
        },
      ],
    },
    {
      id: 'use',
      title: 'Cómo usamos la información y nuestras bases jurídicas',
      blocks: [
        {
          list: [
            'Para prestar el servicio: crear y proteger su cuenta, guardar sus estimaciones y enlaces compartidos y aplicar su plan.',
            'Para cobrar y gestionar suscripciones, a través de Lemon Squeezy.',
            'Para responder a las solicitudes de soporte.',
            'Para verificar las claves de licencia que usan la herramienta de línea de comandos y el servidor MCP.',
            'Para mantener la seguridad del servicio y prevenir el fraude y el abuso.',
            'Para enviar mensajes del servicio, como enlaces de inicio de sesión y respuestas a sus solicitudes. Solo enviamos correo comercial si lo ha aceptado.',
          ],
        },
        'Conforme a la Ley de Protección de Datos Personales Digitales de la India de 2023, tratamos los datos personales sobre la base del consentimiento que otorga al crear una cuenta y de los usos legítimos que permite la Ley, como los datos que proporciona voluntariamente para un fin y el cumplimiento de la ley. Conforme al RGPD, nuestras bases jurídicas son la ejecución de nuestro contrato con usted, nuestro interés legítimo en proteger y mejorar el servicio, su consentimiento cuando se lo pedimos y obligaciones legales como los registros fiscales.',
        'No tomamos decisiones sobre usted por medios automatizados que produzcan efectos jurídicos o similarmente significativos, y no elaboramos perfiles sobre usted.',
      ],
    },
    {
      id: 'providers',
      title: 'Proveedores de servicios que utilizamos',
      blocks: [
        'Estos proveedores tratan datos personales por cuenta nuestra, solo siguiendo nuestras instrucciones y conforme a sus condiciones de tratamiento de datos. Lemon Squeezy es el comerciante registrado (merchant of record) de los pagos y trata los datos de pago como responsable independiente conforme a su propia política de privacidad.',
        {
          table: {
            head: ['Proveedor', 'Para qué', 'Dónde'],
            rows: [
              ['Supabase', 'Base de datos, inicio de sesión y funciones de servidor', 'Corea del Sur (Seúl)'],
              ['Lemon Squeezy', 'Pagos, impuestos, facturas y suscripciones (comerciante registrado)', 'Estados Unidos'],
              ['Resend', 'Entrega de avisos de solicitudes de soporte', 'Estados Unidos'],
              ['Zoho Desk', 'Gestión de las conversaciones de soporte', 'Centro de datos de Zoho de nuestra cuenta'],
              ['Google', 'Inicio de sesión con Google, solo si lo utiliza', 'Global'],
              ['GitHub y npm', 'Alojamiento de este sitio web; distribución de la herramienta de línea de comandos', 'Estados Unidos'],
            ],
          },
        },
      ],
    },
    {
      id: 'transfers',
      title: 'Transferencias internacionales',
      blocks: [
        'Los datos de su cuenta se almacenan en Corea del Sur y algunos proveedores están en los Estados Unidos. Por tanto, sus datos personales pueden tratarse fuera del país en el que vive.',
        'En el caso de la India, estas transferencias están permitidas por el artículo 16 de la Ley de Protección de Datos Personales Digitales de 2023, salvo a los países que restrinja el Gobierno de la India. En el Espacio Económico Europeo y el Reino Unido, se reconoce que Corea del Sur ofrece una protección adecuada, y las transferencias a los Estados Unidos se basan en el Marco de Privacidad de Datos UE-EE. UU. cuando el proveedor está certificado, o en las Cláusulas Contractuales Tipo y el Anexo del Reino Unido.',
      ],
    },
    {
      id: 'retention',
      title: 'Cuánto tiempo conservamos los datos',
      blocks: [
        {
          list: [
            'Cuenta, perfil, estimaciones guardadas, enlaces compartidos, claves y solicitudes de soporte almacenados por nosotros: hasta que elimine su cuenta.',
            'Facturación: Lemon Squeezy conserva las facturas y los registros fiscales durante el tiempo que exija la ley. Nuestra propia copia de los eventos de facturación se elimina con su cuenta.',
            'Conversaciones de soporte en nuestro servicio de asistencia: el tiempo necesario para resolver la solicitud y cumplir las obligaciones legales; después se eliminan.',
            'Copias de seguridad y registros: caducan automáticamente según los plazos de nuestros proveedores.',
          ],
        },
        'Puede eliminar su cuenta en cualquier momento desde el menú de perfil («Eliminar cuenta»). Esto borra de inmediato su cuenta y los datos indicados y cancela cualquier suscripción activa.',
      ],
    },
    {
      id: 'security',
      title: 'Cómo protegemos los datos',
      blocks: [
        'Todo el tráfico se cifra en tránsito. La base de datos aplica seguridad a nivel de fila, de modo que cada cuenta solo puede acceder a sus propios registros. Las claves de licencia solo se guardan como hashes y las tarjetas de pago nunca pasan por nuestros sistemas.',
        'Si una violación de datos personales le afecta, se lo comunicaremos y lo notificaremos a las autoridades que exija la ley, incluida la Junta de Protección de Datos de la India y, cuando proceda, las autoridades de control de la UE y del Reino Unido.',
      ],
    },
    {
      id: 'terms',
      title: 'Uso de TokenTicks: cuentas, planes y disponibilidad',
      blocks: [
        {
          list: [
            'Aceptación. Al crear una cuenta, ya sea con correo y contraseña, con un enlace mágico o con Google, acepta esta política y estas condiciones. Si no está de acuerdo, no cree una cuenta; el contador de tokens funciona sin ella.',
            'Conducta y suspensión. Podemos suspender o cerrar una cuenta utilizada de forma indebida, incluidos el fraude, el abuso del servicio o de su sistema de pago, los intentos de vulnerar su seguridad, el uso compartido de claves de licencia más allá de su finalidad o cualquier actividad ilícita. Cuando proceda, le explicaremos el motivo y podrá responder. La suspensión no elimina sus derechos de protección de datos.',
            'Precios y planes. Los precios, los planes y las funciones que incluyen pueden cambiar, sujetos a condiciones como variaciones en nuestros costes, en los impuestos o en los precios de los proveedores de IA. Le avisaremos con una antelación razonable antes de que un cambio de precio se aplique a su próxima renovación, y podrá cancelar antes de que ocurra.',
            'Reembolsos. Los pagos de los planes no son reembolsables, tampoco por periodos de facturación parciales, salvo cuando la ley de su país exija un reembolso. Si cancela, su plan sigue activo hasta el final del periodo ya pagado. Los pagos los procesa Lemon Squeezy como comerciante registrado.',
            'Disponibilidad. Procuramos mantener TokenTicks disponible, pero puede verse limitado o interrumpido temporalmente por hechos ajenos a nuestro control razonable, como catástrofes naturales, pandemias, guerras, disturbios civiles, actuaciones gubernamentales, sanciones, cortes de internet o de electricidad, o fallos de los proveedores de los que dependemos. No somos responsables de los retrasos o interrupciones causados por tales hechos y restableceremos el servicio lo antes posible dentro de lo razonable.',
            'Estimaciones. Los recuentos de tokens y los costes son estimaciones orientativas. Compruebe los precios de cada proveedor antes de comprometer un presupuesto.',
            'Ley aplicable. Estas condiciones se rigen por las leyes de la India. Esto no elimina ninguna protección que le concedan las leyes imperativas de consumo o de protección de datos del país en el que vive.',
          ],
        },
      ],
    },
    {
      id: 'rights-india',
      title: 'Sus derechos en la India',
      blocks: [
        'Conforme a la Ley de Protección de Datos Personales Digitales de 2023 y su Reglamento, tiene derecho a:',
        {
          list: [
            'obtener un resumen de los datos personales que tratamos sobre usted y de nuestro tratamiento, así como la identidad de aquellos con quienes los compartimos;',
            'que se corrijan, completen, actualicen o supriman sus datos personales;',
            'retirar su consentimiento en cualquier momento, con la misma facilidad con que lo otorgó, eliminando su cuenta o escribiéndonos;',
            'que nuestro Responsable de Reclamaciones atienda sus reclamaciones en el plazo que fije el Reglamento;',
            'designar a otra persona para que ejerza sus derechos en caso de fallecimiento o incapacidad.',
          ],
        },
        'Si no está satisfecho con nuestra respuesta, puede presentar una reclamación ante la Junta de Protección de Datos de la India. También cumplimos la Ley de Tecnologías de la Información de 2000 y sus normas sobre prácticas de seguridad razonables. Tal como exige la Ley, le rogamos que facilite información exacta y no presente reclamaciones falsas o infundadas.',
      ],
    },
    {
      id: 'rights-eu',
      title: 'Sus derechos en el Espacio Económico Europeo y el Reino Unido',
      blocks: [
        'Conforme al RGPD y al RGPD del Reino Unido, tiene derecho a acceder a sus datos personales, a rectificarlos, a suprimirlos, a limitar su tratamiento u oponerse a él, a recibirlos en un formato portátil y a retirar su consentimiento en cualquier momento. También tiene derecho a no ser objeto de decisiones basadas únicamente en el tratamiento automatizado.',
        'Respondemos a las solicitudes en el plazo de un mes. Puede presentar una reclamación ante la autoridad de protección de datos del lugar donde vive o trabaja; en España, la Agencia Española de Protección de Datos, y en el Reino Unido, la Information Commissioner\'s Office.',
      ],
    },
    {
      id: 'rights-us',
      title: 'Sus derechos en los Estados Unidos',
      blocks: [
        'Si vive en California (conforme a la CCPA, modificada por la CPRA) o en otro estado de EE. UU. con una ley de privacidad del consumidor, como Virginia, Colorado, Connecticut, Utah o Texas, tiene derecho a saber qué información personal recopilamos y cómo la usamos, a acceder a ella, a corregirla y a eliminarla, y a no ser discriminado por ejercer estos derechos.',
        'En los últimos 12 meses hemos recopilado identificadores (como el nombre y el correo electrónico), información comercial (plan y estado de facturación) y actividad limitada en internet (registros de solicitudes). No vendemos ni compartimos información personal para publicidad conductual entre contextos, y no usamos información personal sensible para inferir características sobre usted. Por lo tanto, no hay nada de lo que excluirse; aun así, respetamos las señales Global Privacy Control. Un agente autorizado puede presentar una solicitud en su nombre.',
      ],
    },
    {
      id: 'rights-other',
      title: 'Sus derechos en otros países',
      blocks: [
        {
          list: [
            'Brasil (LGPD): los derechos del artículo 18, incluidos la confirmación, el acceso, la corrección, la anonimización, la portabilidad y la eliminación; puede reclamar ante la ANPD.',
            'Canadá (PIPEDA y leyes provinciales): acceso y corrección; puede reclamar ante la Oficina del Comisionado de Privacidad de Canadá.',
            'Australia (Privacy Act 1988): acceso y corrección conforme a los Principios Australianos de Privacidad; puede reclamar ante la OAIC.',
            'Singapur (PDPA), Japón (APPI), Corea del Sur (PIPA) y otros: los derechos de acceso, corrección y supresión que le otorgue su legislación local.',
          ],
        },
        'Viva donde viva, puede pedirnos acceder, corregir o eliminar sus datos escribiendo a {{email}}, y responderemos conforme a su legislación local.',
      ],
    },
    {
      id: 'storage',
      title: 'Cookies y almacenamiento local',
      blocks: [
        'No utilizamos cookies publicitarias ni analíticas. La aplicación guarda algunos elementos en el almacenamiento local de su navegador para que funcione tal como la dejó: el borrador de su texto, el modelo y la comparación elegidos, sus supuestos de coste, su tema de color, el idioma de esta página y, cuando ha iniciado sesión, su sesión.',
        'Estos elementos permanecen en su dispositivo y son estrictamente necesarios para las funciones que utiliza, por lo que no se requiere un aviso de consentimiento. Puede borrarlos en cualquier momento desde la configuración de su navegador.',
      ],
    },
    {
      id: 'children',
      title: 'Menores',
      blocks: [
        'TokenTicks no está destinado a menores de 18 años. No tratamos a sabiendas datos personales de menores; la ley india exige el consentimiento verificable de los padres para cualquier persona menor de 18 años. Si cree que un menor ha creado una cuenta, contáctenos y la eliminaremos.',
      ],
    },
    {
      id: 'changes',
      title: 'Cambios en esta política',
      blocks: [
        'Cuando modificamos esta política, actualizamos la fecha de entrada en vigor que figura al principio. Si un cambio es importante, se lo comunicaremos por correo electrónico o en la aplicación antes de que surta efecto. Las versiones anteriores están disponibles previa solicitud.',
      ],
    },
    {
      id: 'contact',
      title: 'Responsable de reclamaciones y contacto',
      blocks: [
        'Responsable de Reclamaciones y contacto de privacidad: {{grievance}}, {{email}}.',
        'Dirección postal: {{address}}.',
        'Acusamos recibo de las solicitudes con prontitud y respondemos en el plazo de un mes, o antes si su legislación local lo exige. Si no está satisfecho, puede reclamar ante la Junta de Protección de Datos de la India o ante la autoridad de protección de datos del lugar donde vive.',
      ],
    },
  ],
};
