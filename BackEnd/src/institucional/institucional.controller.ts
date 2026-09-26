import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiSecurity, ApiExcludeController, ApiTags } from '@nestjs/swagger';

// Dados da casa de leiloes (endereco, contato, horario). Ficam aqui, no servidor,
// para a tela nao ter "regra" nem numeros fixos: o rodape so exibe o que chega
const CASA = {
  nome: 'Belle Époque Leilões',
  lema: 'Toda peça rara conta uma história.',
  endereco: { logradouro: 'Rua das Antiguidades, 120', cidade: 'São Paulo', uf: 'SP', cep: '01310-100' },
  telefone: '(11) 4002-8922',
  telefoneLink: '+551140028922',
  email: 'contato@belleepoqueleiloes.com',
  atendimento: { descricao: 'Seg a Sex, 9h às 18h', abre: 9, fecha: 18, fusoHorario: 'America/Sao_Paulo' },
};

function estaAtendendo(agora: Date): boolean {
  const partes = new Intl.DateTimeFormat('pt-BR', {
    timeZone: CASA.atendimento.fusoHorario,
    weekday: 'short',
    hour: 'numeric',
    hour12: false,
  }).formatToParts(agora);
  const dia = (partes.find((p) => p.type === 'weekday')?.value ?? '').toLowerCase();
  const hora = Number(partes.find((p) => p.type === 'hour')?.value ?? 0) % 24;
  const util = !dia.startsWith('sáb') && !dia.startsWith('dom');
  return util && hora >= CASA.atendimento.abre && hora < CASA.atendimento.fecha;
}

@ApiExcludeController()
@ApiTags('Institucional')
@ApiSecurity('api-key')
@Controller('institucional')
export class InstitucionalController {
  @Get()
  @ApiOperation({
    summary: 'Dados da casa de leilões para o rodapé (livre, sem login)',
    description: '"atendendoAgora" e calculado pelo servidor no fuso de Brasilia.',
  })
  @ApiOkResponse({ description: 'Nome, endereço, contato e horário de atendimento' })
  obter() {
    return {
      nome: CASA.nome,
      lema: CASA.lema,
      endereco: CASA.endereco,
      telefone: CASA.telefone,
      telefoneLink: CASA.telefoneLink,
      email: CASA.email,
      atendimento: { descricao: CASA.atendimento.descricao, atendendoAgora: estaAtendendo(new Date()) },
    };
  }
}
