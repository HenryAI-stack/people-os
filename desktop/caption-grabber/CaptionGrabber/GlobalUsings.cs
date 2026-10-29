// UseWPF drops System.IO from the implicit usings (it clashes with System.Windows.Shapes.Path); the UI is WinForms, so bring it back.
global using System.IO;
