import { useEffect, useRef } from "react";
import { Extension } from "@tiptap/core";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "tiptap-markdown";

interface Props {
  id?: string;
  /** Texto em Markdown (é o que fica gravado na descrição). */
  valor: string;
  aoMudar: (valor: string) => void;
  dica?: string;
  /**
   * "captura": Enter salva e Shift+Enter quebra a linha (a nova tarefa é rápida).
   * "editor": Enter quebra a linha e Ctrl+Enter salva.
   */
  modo: "captura" | "editor";
  aoSalvar?: () => void;
  /** Altura inicial da área de texto (dá para arrastar o canto para mudar). */
  alturaInicial?: string;
}

function markdownDe(editor: Editor): string {
  return (editor.storage as { markdown: { getMarkdown: () => string } }).markdown.getMarkdown();
}

const botao = "flex size-7 items-center justify-center rounded-md text-[13px] text-suave hover:bg-etiqueta hover:text-tinta";
const ativo = "bg-etiqueta text-tinta";

/**
 * Descrição com formatação: negrito, itálico, tachado e listas, pela barra ou pelos atalhos
 * de sempre (Ctrl+B, Ctrl+I, "- " começa uma lista). Grava Markdown.
 */
export default function TextoRico({ id, valor, aoMudar, dica, modo, aoSalvar, alturaInicial = "7rem" }: Props) {
  const salvar = useRef(aoSalvar);
  salvar.current = aoSalvar;
  const ultimo = useRef(valor);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: false, codeBlock: false, blockquote: false, horizontalRule: false }),
      Placeholder.configure({ placeholder: dica ?? "" }),
      Markdown.configure({ html: false, breaks: true, tightLists: true, transformPastedText: true, linkify: false }),
      Extension.create({
        name: "teclasDoJuggl",
        priority: 1000,
        addKeyboardShortcuts() {
          const quebrar = () =>
            this.editor.commands.splitListItem("listItem") || this.editor.commands.setHardBreak();
          const gravar = () => {
            salvar.current?.();
            return true;
          };
          const teclas: Record<string, () => boolean> = { "Mod-Enter": gravar };
          if (modo === "captura") Object.assign(teclas, { Enter: gravar, "Shift-Enter": quebrar });
          return teclas;
        },
      }),
    ],
    content: valor,
    editorProps: {
      attributes: {
        ...(id ? { id } : {}),
        // Começa com uma altura confortável; o canto de baixo arrasta para aumentar ou diminuir.
        class: "texto-rico outline-none px-3 py-1.5 text-sm leading-5 overflow-y-auto resize-y",
        style: `height: ${alturaInicial}; min-height: 3.5rem`,
      },
    },
    onUpdate: ({ editor }) => {
      const md = markdownDe(editor);
      ultimo.current = md;
      aoMudar(md);
    },
  });

  // Valor trocado por fora (limpar depois de salvar, abrir outra tarefa): atualiza o editor.
  useEffect(() => {
    if (!editor || valor === ultimo.current) return;
    ultimo.current = valor;
    editor.commands.setContent(valor, false);
  }, [editor, valor]);

  const marcar = (acao: (e: Editor) => void) => (ev: React.MouseEvent) => {
    ev.preventDefault();
    if (editor) acao(editor);
  };

  return (
    <div className="mt-1 rounded-lg border border-linha bg-cartao focus-within:border-destaque">
      <div className="flex items-center gap-0.5 border-b border-linha px-1.5 py-1" role="toolbar" aria-label="Formatação">
        <button type="button" tabIndex={-1} title="Negrito (Ctrl+B)" onMouseDown={marcar((e) => e.chain().focus().toggleBold().run())} className={`${botao} font-bold ${editor?.isActive("bold") ? ativo : ""}`}>
          B
        </button>
        <button type="button" tabIndex={-1} title="Itálico (Ctrl+I)" onMouseDown={marcar((e) => e.chain().focus().toggleItalic().run())} className={`${botao} italic ${editor?.isActive("italic") ? ativo : ""}`}>
          I
        </button>
        <button type="button" tabIndex={-1} title="Tachado (Ctrl+Shift+S)" onMouseDown={marcar((e) => e.chain().focus().toggleStrike().run())} className={`${botao} line-through ${editor?.isActive("strike") ? ativo : ""}`}>
          S
        </button>
        <span className="mx-1 h-4 w-px bg-linha" />
        <button type="button" tabIndex={-1} title="Lista (comece a linha com - )" onMouseDown={marcar((e) => e.chain().focus().toggleBulletList().run())} className={`${botao} ${editor?.isActive("bulletList") ? ativo : ""}`}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
            <path d="M6 4.5h7M6 8h7M6 11.5h7M3 4.5h.01M3 8h.01M3 11.5h.01" />
          </svg>
        </button>
        <button type="button" tabIndex={-1} title="Lista numerada (comece a linha com 1. )" onMouseDown={marcar((e) => e.chain().focus().toggleOrderedList().run())} className={`${botao} ${editor?.isActive("orderedList") ? ativo : ""}`}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" aria-hidden="true">
            <path d="M6.5 4.5h6.5M6.5 8h6.5M6.5 11.5h6.5M2.5 3.5l1-.5v3M2.3 9.2c.3-.6 1.7-.6 1.7.3 0 .7-1.7 1.3-1.7 2h1.8" />
          </svg>
        </button>
        <span className="ml-auto pr-1 text-[11px] text-apagado">
          {modo === "captura" ? "Shift+Enter quebra a linha" : "Ctrl+Enter salva"}
        </span>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
