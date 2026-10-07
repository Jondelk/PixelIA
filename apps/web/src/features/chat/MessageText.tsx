import { Fragment } from 'react';
import { parseMessage, type Inline } from './messageFormat';

function Inlines({ inlines }: { inlines: Inline[] }) {
  return (
    <>
      {inlines.map((part, index) =>
        part.bold ? (
          <strong key={index} className="font-semibold text-fg">
            {part.text}
          </strong>
        ) : (
          <Fragment key={index}>{part.text}</Fragment>
        ),
      )}
    </>
  );
}

/** Texto de un mensaje con formato mínimo (negrita, viñetas). Nunca interpreta HTML. */
export function MessageText({ text }: { text: string }) {
  return (
    <div className="space-y-2.5">
      {parseMessage(text).map((block, index) =>
        block.type === 'list' ? (
          <ul key={index} className="space-y-1.5 pl-1">
            {block.items.map((item, i) => (
              <li key={i} className="flex gap-2.5">
                <span
                  className="mt-2 size-1 shrink-0 rounded-full bg-accent/80"
                  aria-hidden="true"
                />
                <span>
                  <Inlines inlines={item} />
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p key={index}>
            <Inlines inlines={block.inlines} />
          </p>
        ),
      )}
    </div>
  );
}
