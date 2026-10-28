import { Accordion, Anchor, SegmentedControl, Text, Title } from '@mantine/core'
import { useState, type ReactNode } from 'react'
import Command from './Command'
import Step from './Step'
import './pages.css'

const repository = 'https://github.com/guilhermesvm/sondatlas'

type System = 'windows' | 'linux' | 'pi'
type Option = 'probe' | 'app'
type Shell = (script: string, option?: Option) => string
type Terminal = 'powershell' | 'gitbash'

// The root start-kit and stop-kit scripts take one option to handle only one part: -Probe or -App in PowerShell, --probe or --app in bash (README of the project).
const powershell: Shell = (script, option) => `powershell -ExecutionPolicy Bypass -File .\\${script}.ps1${option ? { probe: ' -Probe', app: ' -App' }[option] : ''}`
const bash: Shell = (script, option) => `bash ${script}.sh${option ? ` --${option}` : ''}`

function VirtualMachine({ system, shell, where }: { system: 'windows' | 'linux', shell: Shell, where: string }) {
  return <>
    <Text maw={860}>
      O kit cria uma máquina virtual Debian com a probe. Leva aproximadamente 12 minutos na primeira vez, a maior parte esperando downloads.
    </Text>
    <ol className="install-steps">
      <Step title="Instale o VirtualBox 7 e o Vagrant">
        {system === 'windows' ? <>
          <Text size="sm">No PowerShell. O Windows pede permissão de administrador.</Text>
          <Command>winget install --id Oracle.VirtualBox --exact</Command>
          <Command>winget install --id Hashicorp.Vagrant --exact</Command>
        </> : <Text size="sm">
          Siga as instruções oficiais do{' '}
          <Anchor href="https://www.virtualbox.org/wiki/Linux_Downloads" target="_blank" rel="noreferrer">VirtualBox</Anchor> e do{' '}
          <Anchor href="https://developer.hashicorp.com/vagrant/install" target="_blank" rel="noreferrer">Vagrant</Anchor> (aba Linux).
        </Text>}
        {system === 'windows' && <Text size="sm">Depois, feche o terminal e abra outro. O terminal aberto antes da instalação não encontra o Vagrant.</Text>}
      </Step>
      <Step title="Crie a máquina virtual">
        <Text size="sm">{where}, na pasta principal do projeto, a mesma onde você rodou o <code>start-kit</code>:</Text>
        <Command>{shell('start-kit', 'probe')}</Command>
        <Text size="sm">Quando o Vagrant perguntar a placa de rede, escolha a do Wi-Fi ou a do cabo.</Text>
        <Text size="sm">{system === 'windows' ? 'Não escolha Hyper-V, vEthernet nem Host-Only.' : 'Não escolha Host-Only.'}</Text>
        <Manual>
          <ol className="install-substeps">
            <li>
              <Text size="sm" fw={600}>Confira a virtualização</Text>
              {system === 'windows' ? <>
                <Text size="sm">Está ativa se aparecer "Hipervisor detectado" ou a virtualização no firmware como "Sim".</Text>
                <Command>systeminfo</Command>
              </> : <>
                <Text size="sm">Com 0, a BIOS bloqueia ou o processador não tem suporte. Em processadores AMD, um número maior que 0 não garante que a BIOS libere.</Text>
                <Command>{"grep -Ec '(vmx|svm)' /proc/cpuinfo"}</Command>
              </>}
            </li>
            <li>
              <Text size="sm" fw={600}>Na pasta lab, crie a máquina virtual</Text>
              <Command>vagrant up</Command>
            </li>
          </ol>
        </Manual>
      </Step>
      <Step title="Guarde a chave e o link de cadastro">
        <Text size="sm">Eles aparecem no fim da instalação. Você vai usá-los na fase Ativar.</Text>
        <Text size="sm">Para ver a chave de novo, na pasta lab:</Text>
        <Command>{'vagrant ssh -c "sudo cat /etc/ripe-atlas/probe_key.pub"'}</Command>
      </Step>
    </ol>
  </>
}

// A quiet alternative for whoever prefers to run each command instead of the kit scripts.
function Manual({ children }: { children: ReactNode }) {
  return <Accordion chevronPosition="left" className="install-manual"
    classNames={{ item: 'install-manual-item', control: 'install-manual-control', chevron: 'install-manual-chevron', label: 'install-manual-label', content: 'install-manual-content' }}>
    <Accordion.Item value="manual">
      <Accordion.Control>Prefiro fazer manualmente</Accordion.Control>
      <Accordion.Panel>{children}</Accordion.Panel>
    </Accordion.Item>
  </Accordion>
}

function Native({ system }: { system: 'linux' | 'pi' }) {
  return <>
    <Text maw={860}>
      {system === 'linux'
        ? 'A probe é instalada direto no Debian 11, 12 ou 13 (amd64), sem máquina virtual, em cerca de 1 minuto.'
        : 'A probe é instalada direto no Raspberry Pi OS 12 ou 13 de 64 bits (arm64), em cerca de 1 minuto. No Raspberry Pi, o kit está documentado, mas ainda não foi testado.'}
    </Text>
    <ol className="install-steps">
      {system === 'pi' && <Step title="Baixe o projeto no Raspberry Pi">
        <Text size="sm">No terminal do Raspberry Pi, direto nele ou por SSH. São poucos arquivos, cerca de 1 MB. Se faltar o git, instale com <code>sudo apt install git</code>.</Text>
        <Command>{`git clone ${repository}.git`}</Command>
      </Step>}
      <Step title="Instale a probe">
        {system === 'linux'
          ? <>
            <Text size="sm">Num terminal, na pasta principal do projeto, a mesma do <code>start-kit</code>:</Text>
            <Command>sudo bash lab/install-probe.sh</Command>
          </>
          : <Command>sudo bash sondatlas/lab/install-probe.sh</Command>}
        <Text size="sm">O script só instala a probe oficial: não atualiza o sistema nem altera a rede ou o SSH.</Text>
      </Step>
      <Step title="Guarde a chave">
        <Text size="sm">No fim, aparece a chave pública da probe. Você vai usá-la na fase Ativar.</Text>
      </Step>
    </ol>
    {system === 'pi' && <Text maw={680} className="install-note">
      A Sondatlas continua no seu computador. Ela lê os dados da probe pela API pública do RIPE, então a probe e a aplicação não precisam
      estar na mesma máquina.
    </Text>}
  </>
}

type Action = { label: string, command: string, note?: string }

// One row per action, in the same layout as the Configurações rows.
function Actions({ actions }: { actions: Action[] }) {
  return <dl className="settings-rows install-actions">
    {actions.map(action => <div key={action.command}>
      <dt>{action.label}</dt>
      <dd>
        <Command>{action.command}</Command>
        {action.note && <Text size="sm" mt={6}>{action.note}</Text>}
      </dd>
    </div>)}
  </dl>
}

// With the kit VM, the probe and the application can also be started or stopped apart, so nobody thinks both must always go together.
function kitActions(system: System, vm: boolean, shell: Shell): Action[] {
  if (system === 'pi') return [
    { label: 'Ligar no Windows', command: powershell('start-kit') },
    { label: 'Desligar no Windows', command: powershell('stop-kit') },
    { label: 'Ligar no Linux', command: bash('start-kit'), note: 'Também vale no Git Bash do Windows.' },
    { label: 'Desligar no Linux', command: bash('stop-kit') },
  ]
  if (!vm) return [{ label: 'Ligar', command: shell('start-kit') }, { label: 'Desligar', command: shell('stop-kit') }]
  return [
    { label: 'Ligar tudo', command: shell('start-kit') },
    { label: 'Desligar tudo', command: shell('stop-kit') },
    { label: 'Desligar só a Sondatlas', command: shell('stop-kit', 'app'), note: 'A probe segue medindo e ganhando créditos.' },
    { label: 'Ligar só a Sondatlas', command: shell('start-kit', 'app'), note: 'Os desafios precisam da probe ligada.' },
  ]
}

function StartAndStop({ system, vm, shell, where }: { system: System, vm: boolean, shell: Shell, where: string }) {
  return <section className="install-path" aria-labelledby="start-and-stop">
    <Title order={2} id="start-and-stop" mb="xs">Ligar e desligar</Title>
    <Text maw={760}>
      {system === 'pi'
        ? 'Depois de ativada na fase Ativar, a probe liga sozinha com o Raspberry Pi. Para a Sondatlas, estes comandos ligam e desligam a aplicação no seu computador, na pasta principal do projeto.'
        : vm
          ? `Depois da instalação, você não precisa repetir os passos acima. Estes comandos ligam e desligam a probe e a Sondatlas sempre que precisar. ${where}, na pasta principal do projeto.`
          : `Depois de ativada na fase Ativar, a probe liga sozinha com o sistema. Para a Sondatlas, estes comandos ligam e desligam a aplicação. ${where}, na pasta principal do projeto.`}
    </Text>
    <Actions actions={kitActions(system, vm, shell)} />
    <Text size="sm" maw={760} mt="lg" className="install-note">
      Para desligar, use o <code>stop-kit</code>, que não apaga nada. O <code>docker compose down -v</code> apaga todo o histórico.
    </Text>
    <Manual>
      {vm && <Text size="sm">Os comandos da probe rodam na pasta lab, e os da Sondatlas na pasta principal.</Text>}
      <Actions actions={[
        ...(vm ? [{ label: 'Ligar a probe', command: 'vagrant up' }, { label: 'Desligar a probe', command: 'vagrant halt' }] : []),
        { label: 'Ligar a Sondatlas', command: 'docker compose up -d --build' },
        { label: 'Desligar a Sondatlas', command: 'docker compose stop' },
      ]} />
    </Manual>
  </section>
}

const vmProblems = (shell: Shell) => [
  { title: 'O comando diz que a virtualização está desligada', body: <>
    <Text size="sm">Ative a virtualização na BIOS do computador. Ela aparece como Intel VT-x, AMD-V ou SVM. Depois, na pasta principal do projeto:</Text>
    <Command>{shell('start-kit', 'probe')}</Command>
    <Text size="sm">Se você faz manualmente, rode <code>vagrant up</code> na pasta lab.</Text>
  </> },
  { title: 'Escolhi a placa de rede errada', body: <>
    <Text size="sm">Na pasta lab do projeto, desligue a máquina virtual:</Text>
    <Command>vagrant halt</Command>
    <Text size="sm">No VirtualBox, abra Configurações → Rede → Adaptador 2 da máquina kit-ripe-atlas-probe, troque o Nome pela placa certa e salve. Depois, ainda na pasta lab:</Text>
    <Command>vagrant up --provision</Command>
  </> },
  { title: 'A instalação parou dizendo que a placa não tem rede', body:
    <Text size="sm">A placa escolhida não chega à Internet. Troque a placa como no item acima ("Escolhi a placa de rede errada").</Text> },
  { title: 'Está muito lento no Windows', windowsOnly: true, body:
    <Text size="sm">O Docker Desktop, que roda a Sondatlas, e o WSL2 ativam o Hyper-V no Windows. Com ele, o VirtualBox funciona num modo mais lento. Funciona, só demora mais.</Text> },
  { title: 'Desliguei o computador. E agora?', body: <>
    <Text size="sm">
      Depois de ligar o computador, use o comando de ligar de "Ligar e desligar", logo acima. A probe volta sozinha.
      Para desligar, use o comando de desligar de lá. Não feche o VirtualBox com "Salvar o estado": a probe fica desconectada.
    </Text>
    <Text size="sm">Se isso já aconteceu, reinicie a máquina virtual na pasta lab do projeto:</Text>
    <Command>vagrant reload</Command>
  </> },
  { title: 'Recriei a máquina virtual', body: <>
    <Text size="sm">Recriar gera uma chave nova. Antes de cadastrar a probe, pode recriar à vontade.</Text>
    <Text size="sm">
      Depois do cadastro, atualize a chave na probe que você já tem, em atlas.ripe.net → My Probes → Manage. Não cadastre outra probe. O RIPE
      aceita no máximo 2 probes por endereço IP, e a Sondatlas continuaria acompanhando a antiga.
    </Text>
    <Text size="sm">As medições não se perdem, porque ficam guardadas fora da máquina virtual.</Text>
  </> },
  { title: 'Apaguei a pasta do projeto sem vagrant destroy', body:
    <Text size="sm">
      A máquina virtual continua no VirtualBox, e criar de novo falha dizendo que kit-ripe-atlas-probe já existe. No VirtualBox, desligue a máquina
      kit-ripe-atlas-probe, escolha Remover e apague todos os arquivos. Depois, crie a máquina virtual de novo e veja o item acima sobre a chave.
    </Text> },
]

export default function Install() {
  const [system, setSystem] = useState<System>('windows')
  const [debian, setDebian] = useState('')
  const [debianPath, setDebianPath] = useState('native')
  const [terminal, setTerminal] = useState<Terminal>('powershell')
  const linuxPath = debian === 'no' ? 'vm' : debian === 'yes' ? debianPath : ''
  const virtualMachine = system === 'windows' || (system === 'linux' && linuxPath === 'vm')
  const shell = system === 'windows' && terminal === 'powershell' ? powershell : bash
  const where = system !== 'windows' ? 'Num terminal' : terminal === 'powershell' ? 'No PowerShell' : 'No Git Bash'
  const problems = virtualMachine ? vmProblems(shell).filter(problem => system === 'windows' || !problem.windowsOnly) : []
  return <div className="install">
    <Title order={1} size="h2">Instalar a probe</Title>
    <Text size="lg" mt="sm" maw={1000}>
      A Sondatlas já está rodando no seu computador, e é por isso que você vê esta página. Falta instalar a software probe oficial do RIPE Atlas. Onde ela vai rodar?
    </Text>
    <SegmentedControl mt="lg" value={system} onChange={value => setSystem(value as System)} aria-label="Onde a probe vai rodar"
      data={[{ value: 'windows', label: 'Windows' }, { value: 'linux', label: 'Linux' }, { value: 'pi', label: 'Raspberry Pi' }]} />
    {system === 'windows' && <div className="install-choice">
      <Text size="sm" fw={600}>Qual terminal você usa?</Text>
      <SegmentedControl size="sm" mt={6} value={terminal} onChange={value => setTerminal(value as Terminal)} aria-label="Qual terminal você usa?"
        data={[{ value: 'powershell', label: 'PowerShell' }, { value: 'gitbash', label: 'Git Bash' }]} />
    </div>}
    {system === 'linux' && <div className="install-choice">
      <Text size="sm" fw={600}>Sua distribuição é Debian 11, 12 ou 13?</Text>
      <SegmentedControl size="sm" mt={6} value={debian} onChange={setDebian} aria-label="Sua distribuição é Debian 11, 12 ou 13?"
        data={[{ value: 'yes', label: 'Sim' }, { value: 'no', label: 'Não' }]} />
      {debian === 'no' && <Text size="sm" mt={6}>Nas outras distribuições, a probe roda numa máquina virtual.</Text>}
      {debian === 'yes' && <>
        <Text size="sm" fw={600} mt="md">Como você quer instalar?</Text>
        <SegmentedControl size="sm" mt={6} value={debianPath} onChange={setDebianPath} aria-label="Como você quer instalar?"
          data={[{ value: 'native', label: 'Direto no sistema' }, { value: 'vm', label: 'Máquina virtual' }]} />
        <Text size="sm" c="dimmed" mt={6}>Direto no sistema leva cerca de 1 minuto. A máquina virtual deixa a probe separada do seu sistema.</Text>
      </>}
    </div>}
    <div className="install-path">
      {system === 'windows' && <VirtualMachine system="windows" shell={shell} where={where} />}
      {system === 'linux' && linuxPath === 'vm' && <VirtualMachine system="linux" shell={shell} where={where} />}
      {system === 'linux' && linuxPath === 'native' && <Native system="linux" />}
      {system === 'pi' && <Native system="pi" />}
    </div>
    {(system !== 'linux' || linuxPath) && <StartAndStop system={system} vm={virtualMachine} shell={shell} where={where} />}

    {problems.length > 0 && <>
      <Title order={2} mt={40} mb="sm">Deu erro?</Title>
      <Accordion variant="separated" maw={820}>
        {problems.map(problem => <Accordion.Item key={problem.title} value={problem.title}>
          <Accordion.Control>{problem.title}</Accordion.Control>
          <Accordion.Panel>{problem.body}</Accordion.Panel>
        </Accordion.Item>)}
      </Accordion>
    </>}
    <Text size="sm" c="dimmed" mt="lg" maw={680}>
      Mais detalhes no <Anchor href={`${repository}/blob/main/lab/README.md`} target="_blank" rel="noreferrer">guia do kit</Anchor>.
    </Text>
  </div>
}
