// Tira os espaços das pontas de um texto. Usado nos nomes e títulos: sem isso, "   " (só espaços)
// passava no MinLength e virava um título em branco. Só mexe em texto; outro tipo segue como veio
// e o @IsString recusa com 400
export function aparar({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}
