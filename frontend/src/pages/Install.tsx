import { Accordion, ActionIcon, Anchor, CopyButton, SegmentedControl, Text, Title } from '@mantine/core'
import { useState, type ReactNode } from 'react'
import './pages.css'

const repository = 'https://github.com/guilhermesvm/network-measurement-platform'

function Command({ children }: { children: string }) {
  return <div className="command">
    <pre><code>{children}</code></pre>
    <CopyButton value={children}>
      {({ copied, copy }) => <ActionIcon variant="subtle" onClick={copy} aria-label={copied ? 'Copiado' : 'Copiar comando'} title={copied ? 'Copiado' : 'Copiar comando'}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {copied ? <path d="M5 12l5 5L20 7" /> : <><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></>}
        </svg>
      </ActionIcon>}
    </CopyButton>
  </div>
}

function Step({ title, children }: { title: string, children: ReactNode }) {
  return <li><Text className="install-step-title">{title}</Text>{children}</li>
}

function VirtualMachine() {
  return <>
    <Text maw={860}>
      O kit cria uma máquina virtual Debian com a probe, no Windows ou no Linux, com o mesmo comando. Leva aproximadamente
      12 minutos na primeira vez, a maior parte esperando downloads.
    </Text>
    <ol className="install-steps">
      <Step title="Confira se a virtualização está ativada">
        <Text size="sm">No Windows, no PowerShell: em "Requisitos do Hyper-V", procure "Hipervisor detectado" ou a virtualização habilitada no firmware.</Text>
        <Command>systeminfo</Command>
        <Text size="sm">No Linux: um número maior que 0 indica processador compatível, mas a BIOS ainda pode bloquear.</Text>
        <Command>{"grep -Ec '(vmx|svm)' /proc/cpuinfo"}</Command>
      </Step>
      <Step title="Instale o VirtualBox 7 e o Vagrant">
        <Text size="sm">No Windows, no PowerShell pelo Winget. O Windows pede permissão de administrador:</Text>
        <Command>winget install --id Oracle.VirtualBox --exact</Command>
        <Command>winget install --id Hashicorp.Vagrant --exact</Command>
        <Text size="sm">
          No Linux, siga as instruções oficiais para a sua distribuição:{' '}
          <Anchor href="https://www.virtualbox.org/wiki/Linux_Downloads" target="_blank" rel="noreferrer">VirtualBox</Anchor> e{' '}
          <Anchor href="https://developer.hashicorp.com/vagrant/install" target="_blank" rel="noreferrer">Vagrant</Anchor> (aba Linux).
        </Text>
        <Text size="sm">Depois, abra um terminal novo e confira o Vagrant:</Text>
        <Command>vagrant --version</Command>
      </Step>
      <Step title="Abra um terminal na pasta lab do projeto">
        <Text size="sm">É a pasta <code>lab/</code> dentro da mesma pasta em que você rodou o <code>docker compose</code>.</Text>
      </Step>
      <Step title="Crie a máquina virtual">
        <Command>vagrant up</Command>
        <Text size="sm">
          O Vagrant pergunta qual placa de rede usar. Escolha a que você usa para acessar a Internet (Wi-Fi ou cabo). <br></br> 
          Não escolha Hyper-V Virtual Ethernet Adapter, vEthernet nem VirtualBox Host-Only.
        </Text>
      </Step>
      <Step title="Guarde a chave e o link de cadastro">
        <Text size="sm">No fim, aparecem a chave pública da probe e o link de cadastro. Você vai usá-los na fase Ativar. Para ver a chave de novo:</Text>
        <Command>{'vagrant ssh -c "sudo cat /etc/ripe-atlas/probe_key.pub"'}</Command>
      </Step>
    </ol>
  </>
}

function Native() {
  return <>
    <Text maw={860}>
      A probe é instalada direto no sistema, sem máquina virtual, em cerca de 1 minuto. Funciona em Debian 11, 12 ou 13 (amd64) e em
      Debian ou Raspberry Pi OS 12 ou 13 de 64 bits (arm64). No Raspberry Pi, o kit está documentado, mas ainda não foi testado.
    </Text>
    <ol className="install-steps">
      <Step title="Baixe o projeto">
        <Text size="sm">São poucos arquivos (cerca de 1 MB); você só vai usar o instalador da probe. Se faltar o git, instale com <code>sudo apt install git</code>.</Text>
        <Command>{`git clone ${repository}.git`}</Command>
      </Step>
      <Step title="Instale a probe">
        <Command>sudo bash network-measurement-platform/lab/install-probe.sh</Command>
        <Text size="sm">O script só instala a probe oficial: não atualiza o sistema nem altera a rede ou o SSH.</Text>
      </Step>
      <Step title="Guarde a chave">
        <Text size="sm">No fim, aparece a chave pública da probe. Você vai usá-la na fase Ativar.</Text>
      </Step>
    </ol>
    <Text maw={680} className="install-note">
      A Sondatlas continua no seu computador. Ela lê os dados da probe pela API pública do RIPE, então a probe e a aplicação não precisam
      estar na mesma máquina.
    </Text>
  </>
}

const problems = [
  { title: 'O VirtualBox diz que a virtualização está desligada', body: <>
    <Text size="sm">Ative a virtualização (Intel VT-x ou AMD-V) na BIOS/UEFI do computador e crie a máquina virtual de novo:</Text>
    <Command>vagrant up</Command>
  </> },
  { title: 'Escolhi a placa de rede errada', body: <>
    <Text size="sm">Desligue a máquina virtual:</Text>
    <Command>vagrant halt</Command>
    <Text size="sm">No VirtualBox, abra Configurações → Rede → Adaptador 2 da máquina kit-ripe-atlas-probe, troque o Nome pela placa certa e salve. Depois:</Text>
    <Command>vagrant up --provision</Command>
  </> },
  { title: 'A instalação parou dizendo que a placa não tem rede', body:
    <Text size="sm">A placa escolhida não chega à Internet. Troque a placa como no item acima ("Escolhi a placa de rede errada").</Text> },
  { title: 'Está muito lento no Windows', body:
    <Text size="sm">O Docker Desktop, que roda a Sondatlas, e o WSL2 ativam o Hyper-V no Windows. Com ele, o VirtualBox funciona num modo mais lento. Funciona, só demora mais.</Text> },
  { title: 'Desliguei o computador. E agora?', body: <>
    <Text size="sm">Depois de ligar o computador, rode o comando abaixo na pasta lab.  A probe volta sozinha:</Text>
    <Command>vagrant up</Command>
    <Text size="sm">Para desligar a máquina virtual, use o comando abaixo. Não feche o VirtualBox com "Salvar o estado": a probe fica desconectada.</Text>
    <Command>vagrant halt</Command>
    <Text size="sm">Se isso já aconteceu, reinicie a máquina virtual:</Text>
    <Command>vagrant reload</Command>
  </> },
  { title: 'Recriei a máquina virtual', body:
    <Text size="sm">A chave muda. Atualize a chave da probe que você já tem em atlas.ripe.net → My Probes → Manage, em vez de cadastrar outra probe.</Text> },
]

export default function Install() {
  const [path, setPath] = useState('vm')
  return <div className="install">
    <Title order={1} size="h2">Instalar a probe</Title>
    <Text size="lg" mt="sm" maw={680}>Você vai instalar a software probe oficial do RIPE Atlas. Escolha onde ela vai rodar.</Text>
    <SegmentedControl mt="lg" value={path} onChange={setPath} aria-label="Onde a probe vai rodar"
      data={[{ value: 'vm', label: 'Windows ou Linux' }, { value: 'native', label: 'Debian ou Raspberry Pi' }]} />
    <div className="install-path">{path === 'vm' ? <VirtualMachine /> : <Native />}</div>

    <Title order={2} mt={40} mb="sm">Deu erro?</Title>
    <Accordion variant="separated" maw={820}>
      {problems.map(problem => <Accordion.Item key={problem.title} value={problem.title}>
        <Accordion.Control>{problem.title}</Accordion.Control>
        <Accordion.Panel>{problem.body}</Accordion.Panel>
      </Accordion.Item>)}
    </Accordion>
    <Text size="sm" c="dimmed" mt="lg" maw={680}>
      Mais detalhes no <Anchor href={`${repository}/blob/main/lab/README.md`} target="_blank" rel="noreferrer">guia do kit</Anchor>.
    </Text>
  </div>
}
