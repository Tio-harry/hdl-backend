'use strict';

// Tests and their child processes use only the environment supplied by the runner.
require('dotenv').config = () => ({ parsed: {} });
require('./bloquear-rede.cjs');
