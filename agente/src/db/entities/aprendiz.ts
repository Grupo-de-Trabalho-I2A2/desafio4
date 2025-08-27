// arquivo: src/db/entities/aprendiz.ts
import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity({ name: 'aprendizes' })
export class Aprendiz {
  @PrimaryGeneratedColumn('increment')
  id!: number;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 32 })
  matricula!: string;

  @Column({ type: 'varchar', length: 256, nullable: true })
  empresa!: string | null;

  @Column({ type: 'varchar', length: 256, nullable: true })
  cargo!: string | null;

  @Column({ type: 'varchar', length: 256, nullable: true })
  sindicato!: string | null;

  @Column({ type: 'char', length: 10, nullable: true })
  data_admissao!: string | null; // 'AAAA-MM-DD' se quiser preencher depois

  @Column({ type: 'char', length: 10, nullable: true })
  data_desligamento!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  situacao!: string | null;

  @Column({ type: 'tinyint', width: 1, default: 1 })
  elegivel_beneficio!: boolean;
}