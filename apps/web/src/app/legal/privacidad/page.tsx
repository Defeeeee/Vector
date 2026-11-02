import type { Metadata } from "next";
import LegalShell from "../LegalShell";
import CambiarConsentimientoMeta from "@/components/publico/CambiarConsentimientoMeta";

export const metadata: Metadata = {
  title: "Política de Privacidad | Vector",
  description: "Qué datos trata Vector, con quién se comparten y qué derechos tenés sobre ellos.",
};

/**
 * BORRADOR TÉCNICO — REQUIERE REVISIÓN HUMANA ANTES DE PUBLICAR.
 *
 * Lo que está acá es verificable contra el código: qué se guarda, dónde y a qué
 * terceros se envía. Eso lo puede escribir un agente porque sale de leer el repo.
 *
 * Lo que NO puede escribir un agente y hay que completar o confirmar:
 *   - La razón social y el domicilio del responsable.
 *   - Los plazos concretos de retención.
 *   - Cualquier afirmación sobre jurisdicción.
 *
 * Ver T3.10 en docs/brief/06-plan-post-flightdeck.md.
 *
 * La sección "Perfil público y red de pilotos" (2026-09-22) describe lo que hace el
 * código: qué campos publica `perfiles_publicos` y qué devuelve
 * `GET /publico/pilotos/{handle}` del backend. Desde la 2.20.0 también las
 * publicaciones: el chip del vuelo (`resumen_de_vuelo`), las fotos (`services/imagenes.py`
 * y sus buckets) y quién las ve (el RLS de la migración 019). Si eso cambia, esto cambia.
 *
 * Desde la 2.25.0 (migraciones 024 a 027 del backend): los planes de vuelo y la firma, lo
 * que va a la oficina ARO/AIS (`actions/plan-de-vuelo.ts`) y el mail para cargar el vuelo
 * (`/api/cron/plan-por-registrar`).
 *
 * Desde la 2.21.0 (migraciones 020 y 021): el número de licencia y el legajo del libro
 * en PDF, los bloqueos, los reportes y las suscripciones a los avisos push
 * (`services/avisos.py`: qué dice cada aviso, y que nunca lleva datos de la bitácora).
 */
export default function PrivacidadPage() {
  return (
    <LegalShell title="Política de Privacidad" updated="2 de noviembre de 2026">
      <section>
        <h2>Qué es esto</h2>
        <p>
          Vector es una bitácora de vuelo digital para pilotos. Para funcionar necesita
          guardar el registro de tus vuelos y algunos datos personales. Esta página
          explica cuáles, dónde viven y con quién se comparten.
        </p>
      </section>

      <section>
        <h2>Qué datos tratamos</h2>
        <ul>
          <li>
            <strong>Perfil:</strong> nombre, correo electrónico, tipo de licencia y, si los
            cargás, tu número de teléfono, tu número de licencia y tu legajo. Estos dos
            últimos sólo se usan en el encabezado de tu libro de vuelo en PDF, y no se
            publican.
          </li>
          <li>
            <strong>Vuelos:</strong> fecha, ruta, aeródromos, aeronave, horarios, duración,
            aterrizajes y el desglose de horas por categoría ANAC.
          </li>
          <li>
            <strong>Aeronaves:</strong> matrícula, tipo y, opcionalmente, potencia y costo
            por hora.
          </li>
          <li>
            <strong>Documentación:</strong> tipo de documento, nombre y fecha de
            vencimiento. Esto incluye el <strong>Certificado Médico Aeronáutico</strong>,
            que es un dato de salud y por lo tanto un dato sensible bajo la Ley 25.326.
          </li>
          <li>
            <strong>Planes de vuelo:</strong> si los armás en Vector, el formulario (avión,
            ruta, horarios, personas a bordo, el comandante con su licencia y su teléfono) y tu
            firma, que se guarda para no pedírtela en cada plan. Si lo mandás desde Vector, el
            PDF firmado va a la oficina ARO/AIS de EANA que elijas, con copia a vos; lo mismo
            la demora y la cancelación.
          </li>
          <li>
            <strong>Pasar los vuelos al CAD de ANAC, y traerlos:</strong> si usás el marcador
            &quot;Vector → CAD&quot;, tus vuelos van de Vector a tu sesión del CAD, en tu navegador,
            y se cargan como si los escribieras vos; Vector guarda el número que el CAD le da a
            cada vuelo, para no repetirlo. Si elegís &quot;Traer a Vector&quot;, el marcador lee de tu
            sesión del CAD los vuelos que ya declaraste y Vector guarda sólo los que tildás, con
            los datos del libro (fecha, horarios, aeródromos, matrícula, horas, aterrizajes y
            finalidad). Vector no ve tu contraseña de ANAC. La autoridad certificante de un vuelo
            (el cargo y el nombre y apellido de quien lo certifica, que el CAD pide) se guarda en
            Vector sólo si la cargás vos, en el vuelo o al pasarlo al CAD; al traer vuelos del CAD
            no se guarda. No se publica en tu perfil ni en la red.
          </li>
          <li>
            <strong>Saldo y paquetes de horas:</strong> si usás esa función, los
            movimientos que registres.
          </li>
          <li>
            <strong>Conversaciones con el copiloto:</strong> si lo usás por WhatsApp, se
            guarda el historial de la conversación junto a tu número.
          </li>
          <li>
            <strong>Los mails que te mandamos:</strong> qué mail te llegó y cuándo, si lo
            abriste y qué links tocaste. Lo medimos nosotros, con una imagen que se carga al
            abrir el mail y con los links, que pasan por Vector antes de llevarte a destino.
            De cada link guardamos a dónde iba (la pantalla de Vector o el sitio de afuera),
            no la dirección completa. Si tu correo bloquea las imágenes, la apertura no se
            registra; y si preferís que no quede registro de los links, podés copiar la
            dirección de destino en vez de tocarlos. El link para darte de baja no se mide.
          </li>
        </ul>
      </section>

      <section>
        <h2>Dónde se guardan</h2>
        <p>
          En una base de datos gestionada por <strong>Supabase</strong>. Cada usuario sólo
          puede leer y escribir sus propios registros: la base aplica reglas de acceso por
          fila, no depende de que la aplicación se acuerde de filtrar. La única excepción es
          tu perfil en la red y lo que publiques en ella (ver abajo).
          Las fotos de la red se guardan en el almacenamiento de archivos del mismo
          proveedor.
        </p>
      </section>

      <section>
        <h2>Perfil público y red de pilotos</h2>
        <p>
          Elegir tu @ es parte del alta: sin él no se termina de crear la cuenta. Al elegirlo
          decidís si tu perfil es <strong>público o privado</strong> —en el alta arranca
          privado— y lo podés cambiar cuando quieras desde el Hangar. Esto es lo que se
          publica:
        </p>
        <ul>
          <li>
            <strong>Siempre visibles para cualquiera</strong>, con o sin cuenta en Vector y
            aunque tu perfil sea privado: tu @, el nombre que elijas mostrar (no tiene que ser
            el tuyo), tu licencia, tu bio y tu foto de perfil si las cargás, y cuántos
            seguidores tenés y a cuántos pilotos seguís.
          </li>
          <li>
            <strong>Tus horas agregadas</strong> —totales, PIC, de travesía, de noche y de
            instrumentos— <strong>y lo que publiques</strong>: visibles para cualquiera si tu
            perfil es público, o sólo para los pilotos que aceptes si es privado.
          </li>
        </ul>
        <p>
          <strong>Nada de tu bitácora se publica solo.</strong> Sólo sale lo que vos
          compartís en una publicación: un texto, fotos, y de un vuelo, únicamente los datos
          que elijas —la ruta como origen y destino, la duración, el tipo de avión, la fecha y,
          si lo tiene, <a href="#adsb">el recorrido</a>—. <strong>La matrícula nunca se publica</strong>, ni tus documentos, horarios
          o cualquier otro dato de tu cuenta. Lo que se publica de un vuelo es una copia:
          editar o borrar el vuelo después no lo cambia. Las horas son las que cargaste vos;
          no son una certificación de ANAC.
        </p>
        <p>
          <strong>Las fotos se procesan antes de guardarse:</strong> se achican y se les
          borran los metadatos (EXIF), incluida la ubicación GPS que guardan los teléfonos.
          Las de tus publicaciones se sirven con enlaces que vencen a las pocas horas y
          sólo se entregan a quien puede ver tu perfil; la foto de perfil es pública, como
          tu @.
        </p>
        <p>
          Los aplausos y comentarios que dejes los ve quien puede ver la publicación. Podés
          borrar tus comentarios, y los que otros dejen en tus publicaciones.
        </p>
        <p>
          <strong>Podés bloquear a un piloto:</strong> deja de ver tu perfil y lo que
          publicás, vos dejás de ver lo suyo, y se cortan los seguimientos entre los dos. No
          se le avisa. Lo desbloqueás desde el Hangar.
        </p>
        <p>
          <strong>Podés reportar</strong> un perfil, una publicación o un comentario. Se
          guarda quién reportó, qué y el motivo, para que lo revise quien administra la red;
          a quien reportaste no se le dice quién fue.
        </p>
        <p>
          <strong>Avisos push, si los activás:</strong> se guarda la dirección de envío que
          te da el navegador de ese dispositivo (no tu número ni tu correo). Los avisos dicen
          quién te siguió, te aplaudió o te comentó, y nunca llevan datos de tu bitácora. Se
          desactivan desde el Hangar, y al cerrar sesión se dan de baja en ese dispositivo.
        </p>
        <p>
          Podés pasar de público a privado, editar o borrar lo publicado, o borrar tu perfil
          cuando quieras desde el Hangar. Borrar el perfil elimina también tus seguidores, a
          quién seguís, tus publicaciones con sus fotos, y tus aplausos y comentarios.
        </p>
      </section>

      <section>
        <h2>Con quién se comparten</h2>
        <p>
          No vendemos datos ni los cedemos con fines publicitarios. Se comparten con estos
          proveedores, y sólo para prestar el servicio:
        </p>
        <ul>
          <li>
            <strong>Google (Gemini)</strong> — cuando usás el copiloto, tu consulta y el
            contexto necesario para responderla se envían a la API de Gemini. Ese contexto
            puede incluir datos de tus vuelos, aeronaves y vencimientos. Cuando buscás
            aeródromos con una frase, se envía sólo esa frase.
          </li>
          <li>
            <strong>Kapso / WhatsApp</strong> — para enviarte los avisos de vencimiento y
            para el copiloto por WhatsApp. Implica compartir tu número de teléfono y el
            contenido del mensaje.
          </li>
          <li>
            <strong>Supabase</strong> — alojamiento de la base de datos, autenticación y
            las fotos de la red.
          </li>
          <li>
            <strong>Resend</strong> — el envío de los mails (el briefing del vuelo, el de
            bienvenida, el resumen del mes, las novedades, el plan de vuelo que mandás a la
            oficina, el aviso para cargar un vuelo de tu plan y los de tu cuenta: confirmar el
            mail y recuperar la contraseña). Implica compartir tu correo y el contenido del
            mensaje.
          </li>
          <li>
            <strong>El servicio de avisos de tu navegador</strong> (Google, Apple o Mozilla,
            según cuál uses) — sólo si activás los avisos push. El aviso viaja cifrado de
            punta a punta: ese servicio lo entrega, pero no puede leerlo.
          </li>
          <li>
            <strong>Meta</strong> (Facebook e Instagram) — sólo si aceptás el píxel en la
            portada o las guías. Ver <a href="#meta">Medición de anuncios</a>.
          </li>
          <li>
            <strong>ANAC</strong> — si pasás tus vuelos al CAD (ver{" "}
            <a href="#cad">Tus vuelos en el CAD de ANAC</a>). Además, cuando abrís la ficha de
            un aeródromo o el briefing de una ruta, tu navegador le pide a ANAC su ficha de
            MADHEL y sus NOTAM directamente, como si entraras a su sitio: ANAC ve tu IP y qué
            aeródromo consultaste, y no le mandamos ningún otro dato tuyo.
          </li>
        </ul>
        <p>
          <strong>Transferencia internacional:</strong> estos proveedores procesan la
          información fuera de la Argentina. Al usar el copiloto o los avisos por WhatsApp
          estás aceptando esa transferencia.
        </p>
      </section>

      <section>
        <h2>Para qué los usamos</h2>
        <ul>
          <li>Llevar tu bitácora y calcular tus horas por categoría.</li>
          <li>Avisarte cuando un documento está por vencer.</li>
          <li>
            Mandarte por mail el briefing del vuelo que programaste y, una sola vez en los días
            siguientes a crear tu cuenta, cómo cargar tu primer vuelo si todavía no lo hiciste.
          </li>
          <li>
            Mandar tu plan de vuelo, su demora o su cancelación a la oficina ARO/AIS que
            elegiste, cuando lo pedís; y, una hora y media después de la llegada estimada de un
            plan que presentaste, avisarte por mail para que cargues el vuelo, si todavía no
            está en tu bitácora. Es un mail por plan.
          </li>
          <li>
            Mandarte por mail, el primer día de cada mes, un resumen del mes anterior: horas,
            aterrizajes, lo que te falta para la próxima licencia, tu saldo y si tu CMA está
            por vencer. Te llega si cargaste al menos un vuelo, y te das de baja con el link
            que trae cada mail.
          </li>
          <li>
            Mandarte por mail, de vez en cuando, las novedades de Vector. Te llegan si tenés
            una cuenta con el mail confirmado, y te das de baja con el link que trae cada
            mail. Darte de baja de las novedades no te saca del resumen del mes, ni al revés.
          </li>
          <li>
            Saber si los mails sirven: cuántos se abren y qué links se tocan, para mejorarlos
            y para detectar si están cayendo en spam. Lo vemos en conjunto y por cuenta, y
            no lo compartimos con nadie.
          </li>
          <li>Responder tus consultas cuando usás el copiloto.</li>
          <li>Detectar inconsistencias en tu libro (superposiciones, duplicados).</li>
        </ul>
        <p>
          No usamos tus datos de vuelo para entrenar modelos ni para elaborar perfiles con
          fines comerciales.
        </p>
      </section>

      <section id="meta">
        <h2>Medición de anuncios (píxel de Meta)</h2>
        <p>
          Vector publica anuncios en Instagram y Facebook. Para saber si funcionan usamos el
          píxel de Meta, y <strong>sólo si lo aceptás</strong> en el cartel que aparece la
          primera vez. Si no elegís o decís que no, no se carga.
        </p>
        <ul>
          <li>
            <strong>Dónde:</strong> sólo en la portada y en las guías, y al terminar el
            registro. Nunca adentro de la app, ni en el perfil público de un piloto, ni en las
            pantallas de ingreso.
          </li>
          <li>
            <strong>Qué le llega a Meta:</strong> que visitaste esa página o que creaste una
            cuenta, junto con lo que el navegador le manda a cualquier sitio (dirección IP, tipo
            de navegador) y las cookies de Meta, que le permiten relacionarlo con tu cuenta de
            Facebook o Instagram si tenés una. No le mandamos tu mail, tus vuelos ni ningún dato
            de tu bitácora, y la carga automática de datos de la página está apagada.
          </li>
          <li>
            <strong>Para qué:</strong> medir cuántas personas llegan desde un anuncio y se
            registran, y mostrarle los anuncios a gente parecida. Meta trata esos datos según su
            propia política de privacidad.
          </li>
        </ul>
        <p>Tu elección queda guardada en este navegador, y la podés cambiar cuando quieras:</p>
        <CambiarConsentimientoMeta />
      </section>

      <section id="adsb">
        <h2>El recorrido de tus vuelos (ADS-B)</h2>
        <p>
          Muchos aviones transmiten su posición por ADS-B, una señal pública que reciben antenas de
          aficionados en todo el mundo. Vector la usa para mostrarte el recorrido real de tus vuelos y
          reconocerlos cuando los cargás.
        </p>
        <ul>
          <li>
            <strong>Qué graba:</strong> la posición, la altura y la velocidad de los aviones que están en
            el Hangar de algún piloto de Vector, sólo mientras transmiten y dentro de la zona que se
            graba. Es la misma información que muestra cualquier sitio público de seguimiento de
            aviones. Los datos vienen de{" "}
            <a href="https://adsb.fi" target="_blank" rel="noreferrer">adsb.fi</a>.
          </li>
          <li>
            <strong>Qué ves:</strong> el recorrido de un vuelo tuyo, entre el despegue y el aterrizaje que
            cargaste, y los horarios de los vuelos que hizo tu avión el día que estás cargando. Un
            avión de escuela lo vuelan varios pilotos: nunca te mostramos el recorrido de un vuelo que
            no cargaste vos.
          </li>
          <li>
            <strong>Qué se comparte:</strong> nada, salvo que vos lo elijas. En una publicación podés
            prender el recorrido de un vuelo: sale su forma y su altura, sin horarios ni velocidad. Y
            desde el vuelo podés armar una imagen del recorrido para compartirla donde quieras; lleva la
            fecha, el tipo de avión y los horarios en el aire, pero nunca la matrícula.
          </li>
          <li>
            <strong>Cuánto se guarda:</strong> las posiciones sueltas se borran a los 30 días. El
            recorrido de un vuelo tuyo queda guardado con ese vuelo, y se borra si borrás el vuelo.
          </li>
        </ul>
      </section>

      <section id="pegatinas">
        <h2>Pegatinas con QR</h2>
        <p>
          Vector reparte pegatinas con un código QR, cada una con su propio código, para saber
          desde qué lugar llega la gente.
        </p>
        <ul>
          <li>
            <strong>Al escanear una:</strong> anotamos que esa pegatina se escaneó, cuándo y si
            ya tenías sesión en Vector. No anotamos tu dirección IP, tu teléfono ni tu ubicación.
          </li>
          <li>
            <strong>Si no tenías cuenta:</strong> te dejamos una cookie propia de Vector con el
            código de la pegatina y la hora del escaneo, que dura 30 días. Si en ese tiempo creás
            una cuenta, anotamos en ella de qué pegatina viniste, y la cookie se borra. No se
            comparte con nadie.
          </li>
        </ul>
      </section>

      <section id="cad">
        <h2>Tus vuelos en el CAD de ANAC</h2>
        <p>
          Podés pasar tus vuelos al CAD de ANAC de dos maneras, y elegís vos:
        </p>
        <ul>
          <li>
            <strong>Con el marcador:</strong> cargás desde tu propia sesión del CAD, en tu
            navegador. Tu contraseña de ANAC nunca pasa por Vector.
          </li>
          <li>
            <strong>Desde Vector:</strong> si conectás tu cuenta de ANAC, guardamos tu usuario y
            tu contraseña <strong>cifrados</strong>, con una clave que sólo tiene nuestro servidor.
            La contraseña no vuelve nunca a tu pantalla ni a ninguna otra. La usamos sólo para
            entrar al CAD cuando vos pedís leer o cargar vuelos, y lo que mandamos son los datos
            del vuelo que elegiste: fecha, horarios, aeródromos, avión o simulador, horas,
            finalidad y la autoridad certificante. Nunca hacemos la declaración jurada: ésa la
            hacés vos en el CAD. Si ANAC rechaza la contraseña, no la volvemos a probar hasta que
            la escribas de nuevo, para no bloquearte la cuenta. Con <em>Desconectar</em> se borra
            al instante, y también se borra si eliminás tu cuenta de Vector.
          </li>
        </ul>
      </section>

      <section>
        <h2>Tus derechos</h2>
        <p>
          Podés acceder a tus datos, rectificarlos y suprimirlos. La mayoría se puede hacer
          desde la propia aplicación: los vuelos, aeronaves y documentos son editables y
          borrables desde tu cuenta. Para el resto, escribinos.
        </p>
        <p>
          La <strong>Agencia de Acceso a la Información Pública</strong> es el organismo de
          control de la Ley 25.326 y tiene la atribución de atender denuncias por
          incumplimientos.
        </p>
      </section>

      <section>
        <h2>Conservación</h2>
        <p>
          Conservamos tus datos mientras tengas cuenta activa. Si la eliminás, se borran los
          registros asociados.
        </p>
      </section>

      <section>
        <h2>Contacto</h2>
        <p>
          Por cualquier consulta sobre tus datos, escribinos a{" "}
          <a href="mailto:fdiaznemeth@gmail.com">fdiaznemeth@gmail.com</a>.
        </p>
      </section>
    </LegalShell>
  );
}
