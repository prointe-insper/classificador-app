export function Header() {
  return (
    <header className="header">
      <div className="header__inner">
        <div className="header__mark" aria-hidden="true">
          PGE
        </div>
        <div className="header__titles">
          <h1>Classificador de Assuntos Jurídicos</h1>
          <p className="header__subtitle">
            <strong>PGE-SP</strong> · Procuradoria Geral do Estado de São Paulo
            {' '}em parceria com o <strong>Insper</strong>
          </p>
        </div>
      </div>
    </header>
  );
}
