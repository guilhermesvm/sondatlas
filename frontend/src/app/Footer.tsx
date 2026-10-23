import Logo from './Logo'

const ripeLinks = [
  { label: 'Site do RIPE Atlas', href: 'https://atlas.ripe.net/' },
  { label: 'Como hospedar uma probe', href: 'https://atlas.ripe.net/get-involved/become-a-host/' },
  { label: 'Documentação', href: 'https://atlas.ripe.net/docs/' },
  { label: 'RIPE Labs', href: 'https://labs.ripe.net/' },
  { label: 'RIPEstat', href: 'https://stat.ripe.net/' },
]

export default function Footer() {
  return <footer className="site-footer">
    <div>
      <span className="footer-brand"><Logo />Sondatlas</span>
      <p>Trabalho de Conclusão de Curso em Ciência da Computação na Universidade de Passo Fundo (UPF). A Sondatlas não é um site oficial do RIPE NCC: ela usa os dados públicos do RIPE Atlas.</p>
    </div>
    <nav aria-label="RIPE Atlas, fontes oficiais">
      <h2>RIPE Atlas</h2>
      <ul>{ripeLinks.map(link => <li key={link.href}><a href={link.href} target="_blank" rel="noreferrer">{link.label}</a></li>)}</ul>
    </nav>
    <nav aria-label="Projeto">
      <h2>Projeto</h2>
      <ul><li><a href="https://github.com/guilhermesvm/network-measurement-platform" target="_blank" rel="noreferrer">Código-fonte</a></li></ul>
    </nav>
  </footer>
}
