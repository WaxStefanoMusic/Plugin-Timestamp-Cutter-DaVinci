# Video Timestamp Cutter - Graphical installer (WPF, DPI-aware)
# Auto-eleva, mostra la finestra, copia il plugin nella destinazione scelta.

[CmdletBinding()]
param(
    [string]$SourceRoot
)

$ErrorActionPreference = 'Stop'

# Default source root: parent of the installer/ folder. Override via -SourceRoot.
if (-not $SourceRoot -or -not (Test-Path $SourceRoot)) {
    $SourceRoot = Split-Path -Parent (Split-Path -Parent $PSCommandPath)
}

# ---------- Auto-elevate -------------------------------------------------

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    $psArgs = @(
        '-NoProfile', '-ExecutionPolicy', 'Bypass', '-STA',
        '-File', "`"$PSCommandPath`"",
        '-SourceRoot', "`"$SourceRoot`""
    )
    try {
        Start-Process -FilePath 'powershell.exe' -ArgumentList $psArgs -Verb RunAs -WindowStyle Hidden
    } catch {
        # User rejected UAC: silently exit.
    }
    exit
}

# ---------- Per-Monitor V2 DPI awareness (Win10 1703+) -------------------

try {
    Add-Type -Namespace VTC -Name DpiHelper -MemberDefinition @'
        [System.Runtime.InteropServices.DllImport("user32.dll")]
        public static extern bool SetProcessDpiAwarenessContext(System.IntPtr value);
'@ -ErrorAction SilentlyContinue
    [VTC.DpiHelper]::SetProcessDpiAwarenessContext([System.IntPtr](-4)) | Out-Null
} catch {
    # Older Windows: WPF still inherits system DPI awareness, which is fine.
}

Add-Type -AssemblyName PresentationFramework, PresentationCore, WindowsBase, System.Windows.Forms, System.Drawing

# ---------- Constants ----------------------------------------------------

$DEFAULT_DST = Join-Path $env:PROGRAMDATA 'Blackmagic Design\DaVinci Resolve\Support\Workflow Integration Plugins'
$PLUGIN_FOLDER_NAME = 'com.magro.aicutscenefinder'
$PLUGIN_SRC = Join-Path $SourceRoot "plugin\$PLUGIN_FOLDER_NAME"

$pluginVersion = '?'
$pluginName = 'Video Timestamp Cutter'
try {
    $pkg = Get-Content (Join-Path $PLUGIN_SRC 'package.json') -Raw | ConvertFrom-Json
    if ($pkg.version) { $pluginVersion = $pkg.version }
} catch { }

# ---------- XAML UI ------------------------------------------------------

$xaml = @"
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        Title="Video Timestamp Cutter - Installer"
        SizeToContent="Height" Width="680"
        WindowStartupLocation="CenterScreen"
        ResizeMode="NoResize"
        Background="#1e1e1e"
        FontFamily="Segoe UI" FontSize="14"
        TextOptions.TextFormattingMode="Ideal"
        TextOptions.TextRenderingMode="ClearType"
        UseLayoutRounding="True"
        SnapsToDevicePixels="True">
    <Window.Resources>
        <Style TargetType="TextBlock">
            <Setter Property="Foreground" Value="#e0e0e0"/>
        </Style>
        <Style x:Key="PrimaryButton" TargetType="Button">
            <Setter Property="Background" Value="#3a6ea5"/>
            <Setter Property="Foreground" Value="White"/>
            <Setter Property="BorderBrush" Value="#4a80c0"/>
            <Setter Property="BorderThickness" Value="1"/>
            <Setter Property="Padding" Value="22,9"/>
            <Setter Property="FontWeight" Value="SemiBold"/>
            <Setter Property="Cursor" Value="Hand"/>
            <Setter Property="Template">
                <Setter.Value>
                    <ControlTemplate TargetType="Button">
                        <Border Background="{TemplateBinding Background}"
                                BorderBrush="{TemplateBinding BorderBrush}"
                                BorderThickness="{TemplateBinding BorderThickness}"
                                CornerRadius="4">
                            <ContentPresenter HorizontalAlignment="Center" VerticalAlignment="Center"
                                              Margin="{TemplateBinding Padding}"/>
                        </Border>
                    </ControlTemplate>
                </Setter.Value>
            </Setter>
            <Style.Triggers>
                <Trigger Property="IsMouseOver" Value="True">
                    <Setter Property="Background" Value="#4a80c0"/>
                </Trigger>
                <Trigger Property="IsEnabled" Value="False">
                    <Setter Property="Opacity" Value="0.5"/>
                </Trigger>
            </Style.Triggers>
        </Style>
        <Style x:Key="SecondaryButton" TargetType="Button" BasedOn="{StaticResource PrimaryButton}">
            <Setter Property="Background" Value="#3a3a3a"/>
            <Setter Property="BorderBrush" Value="#555"/>
            <Setter Property="FontWeight" Value="Normal"/>
            <Style.Triggers>
                <Trigger Property="IsMouseOver" Value="True">
                    <Setter Property="Background" Value="#4a4a4a"/>
                </Trigger>
                <Trigger Property="IsEnabled" Value="False">
                    <Setter Property="Opacity" Value="0.5"/>
                </Trigger>
            </Style.Triggers>
        </Style>
        <Style TargetType="TextBox">
            <Setter Property="Background" Value="#141414"/>
            <Setter Property="Foreground" Value="#e0e0e0"/>
            <Setter Property="BorderBrush" Value="#444"/>
            <Setter Property="BorderThickness" Value="1"/>
            <Setter Property="Padding" Value="10,8"/>
            <Setter Property="CaretBrush" Value="#e0e0e0"/>
            <Setter Property="SelectionBrush" Value="#3a6ea5"/>
            <Setter Property="VerticalContentAlignment" Value="Center"/>
        </Style>
    </Window.Resources>

    <Grid Margin="32,28,32,24">
        <Grid.RowDefinitions>
            <RowDefinition Height="Auto"/>
            <RowDefinition Height="Auto"/>
            <RowDefinition Height="Auto"/>
            <RowDefinition Height="Auto"/>
            <RowDefinition Height="Auto"/>
            <RowDefinition Height="Auto"/>
            <RowDefinition Height="Auto"/>
            <RowDefinition Height="Auto"/>
            <RowDefinition Height="Auto"/>
        </Grid.RowDefinitions>

        <TextBlock Grid.Row="0" Name="TitleText" Text="Video Timestamp Cutter"
                   FontSize="24" FontWeight="Light" Foreground="White"/>
        <TextBlock Grid.Row="1" Name="SubtitleText" Margin="0,4,0,0" Foreground="#a0a0a0"/>

        <Border Grid.Row="2" Margin="0,22,0,0" Height="1" Background="#2a2a2a"/>

        <TextBlock Grid.Row="3" Margin="0,22,0,8" Foreground="#bbbbbb" Text="Cartella di installazione"/>

        <Grid Grid.Row="4">
            <Grid.ColumnDefinitions>
                <ColumnDefinition Width="*"/>
                <ColumnDefinition Width="Auto"/>
            </Grid.ColumnDefinitions>
            <TextBox Name="PathBox" Grid.Column="0"/>
            <Button Name="BrowseBtn" Grid.Column="1" Margin="10,0,0,0" Content="Sfoglia..." Style="{StaticResource SecondaryButton}"/>
        </Grid>

        <TextBlock Grid.Row="5" Margin="2,8,0,0" FontSize="12" Foreground="#888"
                   Text="Default: cartella Workflow Integration Plugins di DaVinci Resolve."/>

        <ProgressBar Grid.Row="6" Name="Progress" Height="6" Margin="0,22,0,0"
                     Minimum="0" Maximum="100" Value="0"
                     Background="#141414" Foreground="#3a6ea5"
                     BorderBrush="#2a2a2a" Visibility="Collapsed"/>

        <TextBlock Grid.Row="7" Name="StatusText" Margin="0,18,0,0" TextWrapping="Wrap"
                   Foreground="#a0a0a0" MinHeight="40"/>

        <StackPanel Grid.Row="8" Orientation="Horizontal" HorizontalAlignment="Right" Margin="0,18,0,0">
            <Button Name="CancelBtn" Content="Annulla" Style="{StaticResource SecondaryButton}" Margin="0,0,10,0"/>
            <Button Name="InstallBtn" Content="Installa" Style="{StaticResource PrimaryButton}"/>
        </StackPanel>
    </Grid>
</Window>
"@

$reader = New-Object System.Xml.XmlNodeReader([xml]$xaml)
$window = [Windows.Markup.XamlReader]::Load($reader)

$titleText  = $window.FindName('TitleText')
$subtitleText = $window.FindName('SubtitleText')
$pathBox    = $window.FindName('PathBox')
$browseBtn  = $window.FindName('BrowseBtn')
$installBtn = $window.FindName('InstallBtn')
$cancelBtn  = $window.FindName('CancelBtn')
$progress   = $window.FindName('Progress')
$statusText = $window.FindName('StatusText')

$titleText.Text = $pluginName
$subtitleText.Text = "Plugin per DaVinci Resolve Studio  -  Versione $pluginVersion"
$pathBox.Text = $DEFAULT_DST

$script:state = 'ready'   # ready | installing | done

# ---------- Handlers -----------------------------------------------------

$browseBtn.Add_Click({
    $dlg = New-Object System.Windows.Forms.FolderBrowserDialog
    $dlg.Description = 'Scegli la cartella di installazione'
    $dlg.UseDescriptionForTitle = $true
    if (Test-Path $pathBox.Text) { $dlg.SelectedPath = $pathBox.Text }
    elseif (Test-Path $DEFAULT_DST) { $dlg.SelectedPath = $DEFAULT_DST }
    if ($dlg.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
        $pathBox.Text = $dlg.SelectedPath
    }
})

$cancelBtn.Add_Click({ $window.Close() })

function Start-Install {
    $dstRoot = $pathBox.Text.Trim()
    if (-not $dstRoot) {
        $statusText.Text = 'Specifica una cartella di destinazione.'
        $statusText.Foreground = '#e65656'
        return
    }
    if (-not (Test-Path $PLUGIN_SRC)) {
        $statusText.Text = "Sorgente non trovata: $PLUGIN_SRC"
        $statusText.Foreground = '#e65656'
        return
    }
    if (-not (Test-Path (Join-Path $PLUGIN_SRC 'WorkflowIntegration.node'))) {
        $statusText.Text = 'Manca WorkflowIntegration.node nel plugin (pacchetto incompleto).'
        $statusText.Foreground = '#e65656'
        return
    }

    $pluginDst = Join-Path $dstRoot $PLUGIN_FOLDER_NAME

    $script:state = 'installing'
    $installBtn.IsEnabled = $false
    $cancelBtn.IsEnabled = $false
    $browseBtn.IsEnabled = $false
    $pathBox.IsEnabled = $false
    $progress.Visibility = 'Visible'
    $statusText.Foreground = '#a0a0a0'

    try {
        if (-not (Test-Path $dstRoot)) {
            New-Item -ItemType Directory -Path $dstRoot -Force | Out-Null
        }

        $statusText.Text = 'Rimuovo installazione precedente...'
        $progress.Value = 20
        $window.Dispatcher.Invoke([Action]{}, 'Background') | Out-Null
        if (Test-Path $pluginDst) {
            Remove-Item $pluginDst -Recurse -Force
        }

        $statusText.Text = 'Copio i file del plugin...'
        $progress.Value = 55
        $window.Dispatcher.Invoke([Action]{}, 'Background') | Out-Null
        Copy-Item $PLUGIN_SRC $dstRoot -Recurse -Force

        $progress.Value = 100
        $statusText.Foreground = '#4caf50'
        $statusText.Text = "Installazione completata in:`n$pluginDst`n`nChiudi DaVinci Resolve se aperto, riavvialo e apri Workspace -> Workflow Integrations -> $pluginName."

        $script:state = 'done'
        $installBtn.Content = 'Chiudi'
        $installBtn.IsEnabled = $true
    } catch {
        $statusText.Foreground = '#e65656'
        $statusText.Text = "Errore durante l'installazione: $($_.Exception.Message)"
        $script:state = 'ready'
        $installBtn.IsEnabled = $true
        $cancelBtn.IsEnabled = $true
        $browseBtn.IsEnabled = $true
        $pathBox.IsEnabled = $true
        $progress.Visibility = 'Collapsed'
    }
}

$installBtn.Add_Click({
    if ($script:state -eq 'done') { $window.Close(); return }
    if ($script:state -eq 'installing') { return }
    Start-Install
})

$window.Add_Loaded({
    $statusText.Text = "Verra' installato il plugin $pluginName versione $pluginVersion."
})

[void]$window.ShowDialog()
