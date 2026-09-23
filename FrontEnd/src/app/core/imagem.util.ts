// Redimensiona uma imagem escolhida no computador para um quadrado pequeno
// (recorte central) e devolve como data URL JPEG. Assim o avatar fica leve
// para ser guardado como texto no banco (User.avatarUrl)
export function redimensionarParaDataUrl(arquivo: File, lado = 160): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!arquivo.type.startsWith('image/')) {
      reject(new Error('Escolha um arquivo de imagem (JPG, PNG...)'));
      return;
    }
    const leitor = new FileReader();
    leitor.onerror = () => reject(new Error('Não foi possível ler o arquivo'));
    leitor.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Imagem inválida'));
      img.onload = () => {
        const menor = Math.min(img.width, img.height);
        const sx = (img.width - menor) / 2;
        const sy = (img.height - menor) / 2;
        const canvas = document.createElement('canvas');
        canvas.width = lado;
        canvas.height = lado;
        canvas.getContext('2d')!.drawImage(img, sx, sy, menor, menor, 0, 0, lado, lado);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.src = leitor.result as string;
    };
    leitor.readAsDataURL(arquivo);
  });
}
