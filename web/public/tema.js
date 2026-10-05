// Tema antes do primeiro desenho (sem piscar). Arquivo separado, e não script embutido no
// HTML, porque o Content-Security-Policy da API só aceita scripts da própria origem.
// localStorage pode falhar (aba privada, armazenamento bloqueado): aí vale o do sistema.
try {
  const tema = localStorage.getItem("tema");
  if (tema === "light" || tema === "dark") document.documentElement.dataset.theme = tema;
} catch {}
