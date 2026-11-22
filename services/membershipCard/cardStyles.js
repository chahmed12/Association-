'use strict';

const path = require('path');
const { mmToPt } = require('./cardUtils');

const CARD = {
    width: mmToPt(85.60),
    height: mmToPt(53.98),
    safe: mmToPt(3.2)
};

const PALETTE = {
    deep: '#062C2A',
    emerald: '#087F5B',
    gold: '#D8AA55',
    sand: '#E9D7B4',
    white: '#FFFFFF',
    ink: '#132822',
    muted: '#5D6F68',
    soft: '#F7F2E8',
    border: '#C9D8D2'
};

const FONTS = {
    bold: 'Arabic-Bold',
    regular: 'Arabic-Regular'
};

const FONT_BOLD_PATH = path.join(__dirname, '../../fonts/Amiri-Bold.ttf');
const FONT_REGULAR_PATH = path.join(__dirname, '../../fonts/Amiri-Regular.ttf');
const LOGO_PATH = path.join(__dirname, '../../public/images/AssociationJJJ.jpg');

module.exports = {
    CARD,
    PALETTE,
    FONTS,
    FONT_BOLD_PATH,
    FONT_REGULAR_PATH,
    LOGO_PATH,
    mmToPt
};
