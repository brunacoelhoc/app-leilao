// 🔎 Roda UMA vez antes de todos os testes e2e (jest "globalSetup").
// Os e2e criam centenas de contas e leiloes, e varias tabelas sao imutaveis por trigger (nao da para
// apagar). Por isso eles NUNCA rodam no banco de desenvolvimento: usam um banco proprio
// (DATABASE_URL_TESTE), apagado e recriado do zero (com as migrations) a cada execucao.
//
// - Local: defina DATABASE_URL_TESTE no .env (o nome do banco precisa conter "test").
// - CI (GitHub Actions define CI=true): o banco do job ja e efemero, entao e usado como esta.
const { Client } = require('pg');
const { execSync } = require('node:child_process');
const path = require('node:path');
const resolve = (...partes) => path.resolve(...partes);

require('dotenv').config({ path: resolve(__dirname, '../.env'), quiet: true });

module.exports = async () => {
  const urlTeste = process.env.DATABASE_URL_TESTE;

  if (!urlTeste) {
    if (process.env.CI === 'true') return; // banco efemero do CI: segue com o DATABASE_URL do job
    throw new Error(
      'Os testes e2e nao rodam no banco de desenvolvimento.\n' +
        'Defina DATABASE_URL_TESTE no BackEnd/.env, com um banco separado, por exemplo:\n' +
        '  DATABASE_URL_TESTE="postgresql://USUARIO:SENHA@localhost:5432/leiloes_teste"\n' +
        '(o banco e criado e recriado sozinho a cada execucao).',
    );
  }

  const nome = decodeURIComponent(new URL(urlTeste).pathname.slice(1));
  if (!/test/i.test(nome)) {
    throw new Error(`O banco de teste precisa ter "test" no nome (recebido: "${nome}"): ele e apagado a cada execucao.`);
  }
  if (urlTeste === process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL_TESTE nao pode ser igual ao DATABASE_URL (banco de desenvolvimento).');
  }

  // Recria o banco de teste do zero (conectando no banco administrativo "postgres" do mesmo servidor)
  const admin = new URL(urlTeste);
  admin.pathname = '/postgres';
  const cliente = new Client({ connectionString: admin.toString() });
  await cliente.connect();
  try {
    await cliente.query(`DROP DATABASE IF EXISTS "${nome}" WITH (FORCE)`);
    await cliente.query(`CREATE DATABASE "${nome}"`);
  } finally {
    await cliente.end();
  }

  // Aplica as migrations no banco novo e aponta os testes para ele
  process.env.DATABASE_URL = urlTeste;
  execSync('npx prisma migrate deploy', {
    cwd: resolve(__dirname, '..'),
    env: { ...process.env, DATABASE_URL: urlTeste },
    stdio: 'inherit',
  });
};
