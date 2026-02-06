const js = require('@eslint/js');

module.exports = [
    js.configs.recommended,
    {
        languageOptions: {
            ecmaVersion: 2021,
            sourceType: 'commonjs',
            globals: {
                // Node.js
                require: 'readonly',
                module: 'readonly',
                exports: 'readonly',
                process: 'readonly',
                __dirname: 'readonly',
                console: 'readonly',
                Buffer: 'readonly',
                setTimeout: 'readonly',
                setInterval: 'readonly',
                clearTimeout: 'readonly',
                clearInterval: 'readonly',
                fetch: 'readonly',
                // Browser
                window: 'readonly',
                document: 'readonly',
                localStorage: 'readonly',
                location: 'readonly',
                navigator: 'readonly',
                alert: 'readonly'
            }
        },
        rules: {
            'no-unused-vars': 'warn',
            'no-console': 'off',
            'semi': ['warn', 'always'],
            'no-undef': 'error'
        }
    },
    {
        ignores: [
            'node_modules/**',
            'public/js/**',
            '.agent/**'
        ]
    }
];
