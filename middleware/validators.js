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
    })
};

// Middleware générique de validation
const validate = (schemaName) => {
    return (req, res, next) => {
        const schema = schemas[schemaName];
        if (!schema) return next();

        const { error } = schema.validate(req.body, { abortEarly: false });
        if (error) {
            const errors = error.details.map(d => d.message);
            return res.status(400).json({ success: false, errors });
        }
        next();
    };
};

module.exports = { validate };
