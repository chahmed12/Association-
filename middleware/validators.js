const Joi = require('joi');

const schemas = {
    // 1. Validation de l'inscription
    inscription: Joi.object({
        nom: Joi.string().min(3).max(100).required().messages({
            'string.min': "Le nom doit faire au moins 3 caractères.",
            'any.required': "Le nom est obligatoire."
        }),
        telephone: Joi.string().pattern(/^[0-9]{8,15}$/).required().messages({
            'string.pattern.base': "Le numéro de téléphone est invalide (8 à 15 chiffres).",
            'any.required': "Le téléphone est obligatoire."
        }),
        situation: Joi.string().valid('نعم', 'لا').required().messages({
            'any.only': "La situation doit être 'نعم' ou 'لا'.",
            'any.required': "La situation est obligatoire."
        })
    }),

    // 2. Validation du login
    login: Joi.object({
        username: Joi.string().alphanum().min(3).max(30).required(),
        password: Joi.string().min(6).required()
    }),

    // 3. Validation des dépenses
    depense: Joi.object({
        label: Joi.string().min(2).max(255).required(),
        montant: Joi.number().positive().required(),
        categorie: Joi.string().default('autre'),
        date: Joi.date().iso().allow(null, ''),
        note: Joi.string().allow('', null)
    }),

    cotisation: Joi.object({
        membre_id: Joi.number().integer().positive().required(),
        mois: Joi.number().integer().min(1).max(12).required(),
        annee: Joi.number().integer().min(2000).max(2100)
    }),

    membreCreate: Joi.object({
        nom: Joi.string().min(3).max(100).required(),
        telephone: Joi.string().pattern(/^[0-9]{8,15}$/).required(),
        situation: Joi.string().valid('نعم', 'لا').required(),
        montant: Joi.number().integer().positive(),
        whatsapp: Joi.string().allow('', null),
        email: Joi.string().email({ tlds: false }).allow('', null)
    }),

    membreUpdate: Joi.object({
        nom: Joi.string().min(3).max(100),
        telephone: Joi.string().pattern(/^[0-9]{8,15}$/),
        situation: Joi.string().valid('نعم', 'لا'),
        montant: Joi.number().integer().positive(),
        whatsapp: Joi.string().allow('', null),
        email: Joi.string().email({ tlds: false }).allow('', null),
        actif: Joi.boolean()
    }).min(1),

    membreQuery: Joi.object({
        q: Joi.string().allow('').max(100),
        actif: Joi.string().valid('all', 'true', 'false'),
        limit: Joi.number().integer().min(1).max(200),
        page: Joi.number().integer().min(1)
    }),

    exportQuery: Joi.object({
        q: Joi.string().allow('').max(100),
        actif: Joi.string().valid('all', 'true', 'false'),
        mois: Joi.number().integer().min(1).max(12),
        annee: Joi.number().integer().min(2000).max(2100),
        from: Joi.date().iso(),
        to: Joi.date().iso()
    }),
    notificationQuery: Joi.object({
        statut: Joi.string().valid('a_envoyer', 'envoye', 'echoue', 'annule'),
        canal: Joi.string().valid('whatsapp', 'email', 'internal')
    }),
    notificationCreate: Joi.object({
        membre_id: Joi.number().integer().positive().required(),
        canal: Joi.string().valid('whatsapp').required(),
        template: Joi.string().required(),
        scheduled_at: Joi.date().iso(),
        payload: Joi.object().unknown(true).default({})
    }),
    rappelCreate: Joi.object({
        mois: Joi.number().integer().min(1).max(12).required(),
        annee: Joi.number().integer().min(2000).max(2100).required()
    }),
    notificationAction: Joi.object({
        action: Joi.string().valid('envoye', 'annule', 'retry').required()
    }),
    preferencesUpdate: Joi.object({
        whatsapp_optin: Joi.boolean(),
        email_optin: Joi.boolean(),
        locale: Joi.string().max(5)
    }).min(1),

    inscriptionPublic: Joi.object({
        nom: Joi.string().min(3).max(100).required(),
        telephone: Joi.string().pattern(/^[0-9]{8,15}$/).required(),
        situation: Joi.string().valid('نعم', 'لا').required(),
        whatsapp: Joi.string().allow('', null),
        email: Joi.string().email({ tlds: false }).allow('', null),
        consentement: Joi.boolean().valid(true).required()
    }),

    inscriptionQuery: Joi.object({
        statut: Joi.string().valid('en_attente', 'valide', 'rejete')
    }),

    inscriptionDecision: Joi.object({
        motif: Joi.string().min(3).max(1000).required()
    }),

    carteToken: Joi.object({
        token: Joi.string().pattern(/^[0-9a-fA-F]{64}$/).required()
    }),

    evenementQuery: Joi.object({
        avenir: Joi.string().valid('1'),
        statut: Joi.string().valid('brouillon', 'publie', 'annule')
    }),

    evenementCreate: Joi.object({
        titre: Joi.string().min(3).max(255).required(),
        description: Joi.string().allow('', null),
        lieu: Joi.string().allow('', null).max(255),
        date_debut: Joi.date().iso().required(),
        date_fin: Joi.date().iso().allow(null, ''),
        capacite: Joi.number().integer().positive().allow(null),
        statut: Joi.string().valid('brouillon', 'publie', 'annule').default('brouillon')
    }),

    evenementUpdate: Joi.object({
        titre: Joi.string().min(3).max(255),
        description: Joi.string().allow('', null),
        lieu: Joi.string().allow('', null).max(255),
        date_debut: Joi.date().iso(),
        date_fin: Joi.date().iso().allow(null, ''),
        capacite: Joi.number().integer().positive().allow(null),
        statut: Joi.string().valid('brouillon', 'publie', 'annule')
    }),

    rsvpCreate: Joi.object({
        nom_invite: Joi.string().min(2).max(255),
        membre_id: Joi.number().integer().positive(),
        telephone: Joi.string().pattern(/^[0-9]{8,15}$/).allow('', null),
        reponse: Joi.string().valid('oui', 'non', 'peut_etre').required(),
        note: Joi.string().allow('', null).max(2000)
    }).xor('nom_invite', 'membre_id'),

    rsvpToken: Joi.object({
        token: Joi.string().pattern(/^[0-9a-fA-F]{64}$/).required()
    }),

    journalCreate: Joi.object({
        nom: Joi.string().trim().min(2).max(100).required().messages({
            'string.min': "Le nom doit faire au moins 2 caractères.",
            'string.max': "Le nom ne doit pas dépasser 100 caractères.",
            'any.required': "Le nom est obligatoire."
        }),
        message: Joi.string().trim().min(10).max(2000).required().messages({
            'string.min': "Le message doit faire au moins 10 caractères.",
            'string.max': "Le message ne doit pas dépasser 2000 caractères.",
            'any.required': "Le message est obligatoire."
        })
    }),

    journalDecision: Joi.object({
        statut: Joi.string().valid('publie', 'rejete').required()
    }),

    journalId: Joi.object({
        id: Joi.number().integer().positive().required()
    })
};

// Middleware générique de validation
const validate = (schemaName, source = 'body') => {
    return (req, res, next) => {
        const schema = schemas[schemaName];
        if (!schema) return next();

        const data = req[source] === undefined ? {} : req[source];
        const { error } = schema.validate(data, { abortEarly: false });
        if (error) {
            const errors = error.details.map(d => d.message);
            return res.status(400).json({ success: false, errors });
        }
        next();
    };
};

module.exports = { validate, exportQuery: schemas.exportQuery };
